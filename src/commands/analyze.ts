import { Command } from 'commander';
import ora from 'ora';
import { CloudVerseAPI } from '../lib/api-client.js';
import { FileScanner } from '../utils/file-scanner.js';
import { OutputFormatter } from '../utils/formatter.js';
import type { CloudProvider } from '../types.js';

export const analyzeCommand = new Command('analyze')
  .description('Analyze infrastructure files and estimate costs')
  .argument('[files...]', 'Specific files to analyze (defaults to all infrastructure files)')
  .option('-v, --verbose', 'Show detailed output with SKU breakdowns')
  .option('-p, --provider <provider>', 'Cloud provider (aws, azure, gcp)')
  .option('-r, --region <region>', 'Deployment region')
  .option('-o, --output <file>', 'Save report to file (JSON format)')
  .action(async (files: string[], options) => {
    const spinner = ora('Scanning for infrastructure files...').start();

    try {
      const scanner = new FileScanner();
      const api = new CloudVerseAPI();

      // Check for Helm charts
      spinner.text = 'Scanning for Helm charts...';
      const helmCharts = await scanner.scanHelmCharts();
      const helmResults = [];
      
      if (helmCharts.length > 0) {
        spinner.text = `Analyzing ${helmCharts.length} Helm chart(s)...`;
        
        // Analyze all Helm charts
        for (const chart of helmCharts) {
          const result = await api.analyzeHelm(
            chart.chartYaml.content,
            chart.valuesYaml.content,
            chart.templates.map(t => ({ name: t.name, content: t.content }))
          );
          helmResults.push({ chartPath: chart.chartPath, result });
        }
      }

      // Fallback to regular file analysis
      let filesToAnalyze: Array<{ path: string; content: string }> = [];

      if (files && files.length > 0) {
        // Analyze specific files
        spinner.text = 'Reading specified files...';
        for (const file of files) {
          const scanned = await scanner.readFile(file);
          if (scanned) {
            filesToAnalyze.push({
              path: scanned.relativePath,
              content: scanned.content,
            });
          } else {
            spinner.warn(`Could not read file: ${file}`);
          }
        }
      } else {
        // Scan directory for all infrastructure files
        const scanned = await scanner.scanInfrastructureFiles();
        filesToAnalyze = scanned.map(f => ({
          path: f.relativePath,
          content: f.content,
        }));
      }

      // Check if we have ANY infrastructure to analyze
      if (helmResults.length === 0 && filesToAnalyze.length === 0) {
        spinner.fail('No infrastructure files found');
        return;
      }

      // Analyze IaC files if any exist
      let iacResult: any = null;
      if (filesToAnalyze.length > 0) {
        spinner.text = `Analyzing ${filesToAnalyze.length} IaC file(s)...`;

        const filesMap: Record<string, string> = {};
        filesToAnalyze.forEach(f => {
          filesMap[f.path] = f.content;
        });

        iacResult = await api.analyze(filesMap, {
          provider: options.provider as CloudProvider,
          region: options.region,
        });
      }

      // Display combined results
      const helmResourceCount = helmResults.reduce((sum, h) => sum + h.result.summary.resourceCount, 0);
      const iacResourceCount = iacResult ? iacResult.summary.resourceCount : 0;
      const totalResources = helmResourceCount + iacResourceCount;
      
      if (helmResults.length > 0 && filesToAnalyze.length > 0) {
        spinner.succeed(`Analysis complete! Found ${totalResources} resources (${helmResults.length} Helm chart(s), ${filesToAnalyze.length} IaC file(s))`);
      } else if (helmResults.length > 0) {
        spinner.succeed(`Analysis complete! Found ${totalResources} resources in ${helmResults.length} Helm chart(s)`);
      } else {
        spinner.succeed(`Analysis complete! Found ${totalResources} resources in ${filesToAnalyze.length} IaC file(s)`);
      }

      // Display Helm chart results
      for (const { chartPath, result: helmResult } of helmResults) {
        OutputFormatter.printInfo(`\n📦 Helm Chart: ${chartPath}\n`);
        OutputFormatter.printAnalysisSummary(helmResult, {
          verbose: options.verbose,
          showBreakdown: true,
        });
      }

      // Display regular IaC results
      if (iacResult) {
        if (helmResults.length > 0) {
          OutputFormatter.printInfo(`\n📄 IaC Files\n`);
        }
        OutputFormatter.printAnalysisSummary(iacResult, {
          verbose: options.verbose,
          showBreakdown: true,
        });
      }

      // Save output if requested
      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, JSON.stringify({ helm: helmResults, iac: iacResult }, null, 2));
        OutputFormatter.printSuccess(`Report saved to ${options.output}`);
      }

    } catch (error) {
      spinner.fail('Analysis failed');
      OutputFormatter.printError('Failed to analyze infrastructure files', error as Error);
      process.exit(1);
    }
  });
