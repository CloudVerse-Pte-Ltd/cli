import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import type { CloudProvider } from '../types.js';

export interface EstimateRequest {
  files: Record<string, string>;
  provider?: CloudProvider;
  region?: string;
}

export interface EstimateResponse {
  estimate?: {
    id: number;
    provider: CloudProvider;
    region: string;
    totalMonthlyCost: string;
    resourceCount: number;
  };
  resources?: Array<{
    resourceId: string;
    resourceType: string;
    region: string;
    monthlyCost: string;
    skuBreakdown: any[];
    status: string;
  }>;
  violations?: any[];
  recommendations?: OptimizationRecommendation[];
}

export interface OptimizationRecommendation {
  id: string;
  resourceId: string;
  resourceType: string;
  title: string;
  description: string;
  potentialMonthlySavings: number;
  potentialAnnualSavings: number;
  effortRequired: 'low' | 'medium' | 'high';
  estimatedImplementationTime: number;
  performanceImpact: 'positive' | 'neutral' | 'negative' | 'unknown';
  riskLevel: 'low' | 'medium' | 'high';
  currentCost: number;
  optimizedCost: number;
  provider: string;
  isPrimary?: boolean;
  actions: Array<{
    type: string;
    description: string;
    codeSnippet: string;
  }>;
}

export interface AnalyzeResponse {
  provider: CloudProvider;
  totalCost: number;
  resources: Array<{
    resourceId: string;
    resourceType: string;
    region: string;
    monthlyCost: number;
    skuBreakdown: Array<{
      sku: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      cost: number;
    }>;
    status: string;
  }>;
  summary: {
    resourceCount: number;
    byType: Record<string, number>;
    byCost: Record<string, number>;
  };
  recommendations?: OptimizationRecommendation[];
}

export class CloudVerseAPI {
  private client: AxiosInstance;
  private baseURL: string;
  private apiKey?: string;

  constructor(baseURL?: string, apiKey?: string) {
    this.baseURL = baseURL || process.env.CLOUDVERSE_API_URL || 'http://localhost:5000';
    this.apiKey = apiKey || process.env.CLOUDVERSE_API_KEY;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
    });
  }

  async estimate(request: EstimateRequest): Promise<EstimateResponse> {
    const formData = new FormData();
    
    // Get file content and name
    const fileContent = Object.values(request.files)[0];
    const filename = Object.keys(request.files)[0];
    
    // Append file as buffer
    formData.append('file', Buffer.from(fileContent), {
      filename,
      contentType: 'text/plain',
    });
    
    if (request.provider) {
      formData.append('provider', request.provider);
    }
    if (request.region) {
      formData.append('region', request.region);
    }

    const response = await this.client.post<EstimateResponse>('/api/estimate', formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    return response.data;
  }

  async analyze(files: Record<string, string>, options?: {
    provider?: CloudProvider;
    region?: string;
  }): Promise<AnalyzeResponse> {
    // For now, we'll use the estimate endpoint and transform the response
    const firstFile = Object.keys(files)[0];
    const result = await this.estimate({
      files: { [firstFile]: files[firstFile] },
      provider: options?.provider,
      region: options?.region,
    });

    // Transform to AnalyzeResponse format
    const byType: Record<string, number> = {};
    const byCost: Record<string, number> = {};

    const resources = (result.resources || []).map(r => ({
      ...r,
      monthlyCost: parseFloat(r.monthlyCost),
    }));

    resources.forEach(resource => {
      byType[resource.resourceType] = (byType[resource.resourceType] || 0) + 1;
      byCost[resource.resourceType] = (byCost[resource.resourceType] || 0) + resource.monthlyCost;
    });

    const totalCost = parseFloat(result.estimate?.totalMonthlyCost || '0');

    // Fetch recommendations if estimate was created
    let recommendations: OptimizationRecommendation[] = [];
    if (result.estimate?.id) {
      try {
        recommendations = await this.getRecommendations(result.estimate.id);
      } catch (error) {
        // Recommendations are optional, don't fail the analysis
        console.warn('Could not fetch recommendations:', error);
      }
    }

    return {
      provider: result.estimate?.provider || options?.provider || 'aws',
      totalCost,
      resources,
      summary: {
        resourceCount: result.estimate?.resourceCount || 0,
        byType,
        byCost,
      },
      recommendations,
    };
  }

  async getRecommendations(estimateId: number): Promise<OptimizationRecommendation[]> {
    const response = await this.client.get(`/api/recommendations/${estimateId}`);
    return response.data;
  }

  async getEstimate(id: number): Promise<any> {
    const response = await this.client.get(`/api/estimates/${id}`);
    return response.data;
  }

  async listEstimates(): Promise<any[]> {
    const response = await this.client.get('/api/estimates');
    return response.data;
  }

  async deleteEstimate(id: number): Promise<void> {
    await this.client.delete(`/api/estimates/${id}`);
  }

  /**
   * Analyze a Helm chart
   * @param chartYaml Chart.yaml content
   * @param valuesYaml values.yaml content
   * @param templates Array of template files
   */
  async analyzeHelm(
    chartYaml: string,
    valuesYaml: string,
    templates: Array<{ name: string; content: string }>
  ): Promise<AnalyzeResponse> {
    const formData = new FormData();

    // Append Chart.yaml
    formData.append('files', Buffer.from(chartYaml), {
      filename: 'Chart.yaml',
      contentType: 'application/x-yaml',
    });

    // Append values.yaml
    formData.append('files', Buffer.from(valuesYaml), {
      filename: 'values.yaml',
      contentType: 'application/x-yaml',
    });

    // Append template files
    for (const template of templates) {
      formData.append('files', Buffer.from(template.content), {
        filename: `templates/${template.name}`,
        contentType: 'application/x-yaml',
      });
    }

    const response = await this.client.post<EstimateResponse>('/api/estimates/helm', formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    const result = response.data;

    // Transform to AnalyzeResponse format
    const byType: Record<string, number> = {};
    const byCost: Record<string, number> = {};

    const resources = (result.resources || []).map(r => ({
      ...r,
      monthlyCost: parseFloat(r.monthlyCost),
    }));

    resources.forEach(resource => {
      byType[resource.resourceType] = (byType[resource.resourceType] || 0) + 1;
      byCost[resource.resourceType] = (byCost[resource.resourceType] || 0) + resource.monthlyCost;
    });

    const totalCost = parseFloat(result.estimate?.totalMonthlyCost || '0');

    return {
      provider: result.estimate?.provider || 'aws',
      totalCost,
      resources,
      summary: {
        resourceCount: result.estimate?.resourceCount || 0,
        byType,
        byCost,
      },
      recommendations: result.recommendations || [],
    };
  }
}
