// CloudVerse CLI Types
// Keep this lightweight and separate from shared schema to avoid build issues

export type CloudProvider = 'aws' | 'azure' | 'gcp';

export interface AnalysisOptions {
  provider?: CloudProvider;
  region?: string;
}

export interface ResourceCostBreakdown {
  sku: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  cost: number;
}

export interface ResourceEstimate {
  resourceId: string;
  resourceType: string;
  region: string;
  monthlyCost: number;
  skuBreakdown: ResourceCostBreakdown[];
}

export interface AnalysisResult {
  totalCost: number;
  resources: ResourceEstimate[];
  summary: {
    resourceCount: number;
    providers: string[];
    regions: string[];
  };
}
