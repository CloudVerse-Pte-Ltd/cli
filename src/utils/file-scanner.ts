import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { join, relative, dirname } from 'path';

export interface ScannedFile {
  path: string;
  relativePath: string;
  content: string;
  type: 'terraform' | 'cloudformation' | 'helm' | 'unknown';
}

export interface HelmChart {
  chartPath: string;
  chartYaml: { path: string; content: string };
  valuesYaml: { path: string; content: string };
  templates: Array<{ path: string; content: string; name: string }>;
}

export class FileScanner {
  private baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  async scanInfrastructureFiles(): Promise<ScannedFile[]> {
    const files: ScannedFile[] = [];

    // Scan for Terraform files
    const tfFiles = await glob('**/*.tf', {
      cwd: this.baseDir,
      ignore: ['**/node_modules/**', '**/.git/**', '**/.terraform/**'],
    });

    for (const file of tfFiles) {
      const fullPath = join(this.baseDir, file);
      const content = await readFile(fullPath, 'utf-8');
      
      files.push({
        path: fullPath,
        relativePath: file,
        content,
        type: 'terraform',
      });
    }

    // Scan for CloudFormation files
    const cfFiles = await glob('**/*.{yaml,yml,json}', {
      cwd: this.baseDir,
      ignore: ['**/node_modules/**', '**/.git/**', '**/package*.json', '**/Chart.yaml', '**/values.yaml'],
    });

    for (const file of cfFiles) {
      const fullPath = join(this.baseDir, file);
      const content = await readFile(fullPath, 'utf-8');
      
      // Simple heuristic to detect CloudFormation
      if (content.includes('AWSTemplateFormatVersion') || 
          content.includes('Resources:')) {
        files.push({
          path: fullPath,
          relativePath: file,
          content,
          type: 'cloudformation',
        });
      }
    }

    return files;
  }

  /**
   * Scan for Helm charts in the directory
   * Returns an array of Helm chart directories with their files
   */
  async scanHelmCharts(): Promise<HelmChart[]> {
    const charts: HelmChart[] = [];

    // Find all Chart.yaml files
    const chartFiles = await glob('**/Chart.yaml', {
      cwd: this.baseDir,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    for (const chartFile of chartFiles) {
      const chartYamlPath = join(this.baseDir, chartFile);
      // Use path.dirname for cross-platform compatibility instead of string replacement
      const chartDir = dirname(chartYamlPath);
      const valuesYamlPath = join(chartDir, 'values.yaml');
      const templatesDir = join(chartDir, 'templates');

      try {
        // Read Chart.yaml
        const chartYamlContent = await readFile(chartYamlPath, 'utf-8');

        // Check if values.yaml exists
        let valuesYamlContent = '';
        try {
          valuesYamlContent = await readFile(valuesYamlPath, 'utf-8');
        } catch {
          // values.yaml is optional, use empty object
          valuesYamlContent = '{}';
        }

        // Scan templates directory (guard against missing templates dir)
        const templates: Array<{ path: string; content: string; name: string }> = [];
        try {
          const templateFiles = await glob('**/*.{yaml,yml,tpl}', {
            cwd: templatesDir,
            ignore: [],
          });

          for (const templateFile of templateFiles) {
            const templatePath = join(templatesDir, templateFile);
            try {
              const templateContent = await readFile(templatePath, 'utf-8');
              templates.push({
                path: templatePath,
                content: templateContent,
                name: templateFile,
              });
            } catch {
              // Skip unreadable templates
            }
          }
        } catch {
          // Templates directory might not exist (valid for some charts)
          // Continue with empty templates array
        }

        // Include chart even if no templates (some charts only have dependencies)
        charts.push({
          chartPath: chartDir,
          chartYaml: { path: chartYamlPath, content: chartYamlContent },
          valuesYaml: { path: valuesYamlPath, content: valuesYamlContent },
          templates,
        });
      } catch {
        // Skip incomplete charts
      }
    }

    return charts;
  }

  async readFile(filePath: string): Promise<ScannedFile | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const relativePath = relative(this.baseDir, filePath);

      let type: 'terraform' | 'cloudformation' | 'helm' | 'unknown' = 'unknown';
      if (filePath.endsWith('.tf')) {
        type = 'terraform';
      } else if (filePath.endsWith('Chart.yaml')) {
        type = 'helm';
      } else if (filePath.match(/\.(yaml|yml|json)$/)) {
        if (content.includes('AWSTemplateFormatVersion') || 
            content.includes('Resources:')) {
          type = 'cloudformation';
        }
      }

      return {
        path: filePath,
        relativePath,
        content,
        type,
      };
    } catch (error) {
      return null;
    }
  }
}
