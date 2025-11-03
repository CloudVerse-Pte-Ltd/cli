import { Command } from 'commander';
import chokidar from 'chokidar';
import chalk from 'chalk';
import path from 'path';
import { CloudVerseAPI } from '../lib/api-client.js';
import { FileScanner } from '../utils/file-scanner.js';
import { OutputFormatter } from '../utils/formatter.js';
import type { CloudProvider } from '../types.js';

export const watchCommand = new Command('watch')
  .description('Watch infrastructure files for changes and provide real-time cost feedback')
  .argument('[directories...]', 'Directories to watch (defaults to current directory)')
  .option('-p, --provider <provider>', 'Cloud provider (aws, azure, gcp)')
  .option('-r, --region <region>', 'Deployment region')
  .action(async (directories: string[], options) => {
    const dirs = directories.length > 0 ? directories : [process.cwd()];
    // Normalize to absolute path to ensure consistent chart path matching
    const baseDir = path.resolve(dirs[0]);
    const api = new CloudVerseAPI();
    const scanner = new FileScanner(baseDir);

    console.log();
    console.log(chalk.bold.cyan('👀 CloudVerse File Watcher Started'));
    console.log();
    console.log(chalk.bold('📂 Watching:'), baseDir);
    console.log();

    // Set up file watcher (Terraform, CloudFormation, and Helm charts)
    const watcher = chokidar.watch(['**/*.tf', '**/*.yaml', '**/*.yml', '**/*.tpl'], {
      ignored: ['**/node_modules/**', '**/.git/**', '**/.terraform/**', '**/package*.json'],
      persistent: true,
      ignoreInitial: true,
      cwd: baseDir,
    });

    let analysisTimeout: NodeJS.Timeout | null = null;
    let currentlyAnalyzing = false;

    const analyzeFile = async (filePath: string) => {
      if (currentlyAnalyzing) return;
      currentlyAnalyzing = true;

      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.gray(`[${timestamp}]`), chalk.blue('File changed:'), filePath);

      try {
        // Normalize the file path (chokidar emits POSIX paths even on Windows)
        const normalizedFilePath = path.resolve(baseDir, filePath);
        // Split on both POSIX and Windows separators for robustness
        const pathParts = filePath.split(/[\/\\]/);
        
        // Check if this is part of a Helm chart (handles templates at any depth, including root)
        const isHelmFile = filePath.includes('Chart.yaml') || 
                          filePath.includes('values.yaml') || 
                          pathParts.includes('templates') ||
                          filePath.startsWith('templates/') ||
                          filePath.startsWith('templates\\') ||
                          filePath.includes('/templates/') ||
                          filePath.includes('\\templates\\');
        
        if (isHelmFile) {
          // Trigger full Helm chart analysis
          console.log(chalk.gray(`[${timestamp}]`), chalk.cyan('📦 Detecting Helm chart...'));
          const helmCharts = await scanner.scanHelmCharts();
          
          if (helmCharts.length > 0) {
            // Find the chart that contains the changed file by checking if normalized path starts with chart path
            const targetChart = helmCharts.find(chart => normalizedFilePath.startsWith(chart.chartPath)) || helmCharts[0];
            
            const startTime = Date.now();
            console.log(chalk.gray(`[${timestamp}]`), chalk.cyan(`🔍 Analyzing Helm chart: ${targetChart.chartPath}...`));
            
            const result = await api.analyzeHelm(
              targetChart.chartYaml.content,
              targetChart.valuesYaml.content,
              targetChart.templates.map(t => ({ name: t.name, content: t.content }))
            );
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(chalk.gray(`[${timestamp}]`), chalk.green(`✅ Analysis complete (${duration}s)`));
            console.log(chalk.gray(`[${timestamp}]`), chalk.bold('💰 Total Monthly Cost:'), chalk.green(OutputFormatter.formatCurrency(result.totalCost)));
            console.log(chalk.gray(`[${timestamp}]`), chalk.bold('📊 Resources:'), result.summary.resourceCount);
            
            // Show resource breakdown
            const topResources = result.resources
              .sort((a, b) => b.monthlyCost - a.monthlyCost)
              .slice(0, 3);

            if (topResources.length > 0) {
              console.log(chalk.gray(`[${timestamp}]`), chalk.bold('Top Resources:'));
              topResources.forEach((resource, index) => {
                console.log(
                  chalk.gray(`[${timestamp}]`),
                  `  ${index + 1}. ${resource.resourceId}:`,
                  chalk.green(OutputFormatter.formatCurrency(resource.monthlyCost))
                );
              });
            }

            console.log();
            currentlyAnalyzing = false;
            return;
          }
        }

        // Regular file analysis (resolve relative path from watched directory)
        const absoluteFilePath = path.resolve(baseDir, filePath);
        const scannedFile = await scanner.readFile(absoluteFilePath);
        if (!scannedFile || scannedFile.type === 'unknown') {
          console.log(chalk.gray(`[${timestamp}]`), chalk.yellow('Skipped (not an infrastructure file)'));
          currentlyAnalyzing = false;
          return;
        }

        const startTime = Date.now();
        console.log(chalk.gray(`[${timestamp}]`), chalk.cyan('🔍 Analyzing...'));

        const result = await api.analyze(
          { [scannedFile.relativePath]: scannedFile.content },
          {
            provider: options.provider as CloudProvider,
            region: options.region,
          }
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(chalk.gray(`[${timestamp}]`), chalk.green(`✅ Analysis complete (${duration}s)`));
        console.log(chalk.gray(`[${timestamp}]`), chalk.bold('💰 Total Monthly Cost:'), chalk.green(OutputFormatter.formatCurrency(result.totalCost)));
        console.log(chalk.gray(`[${timestamp}]`), chalk.bold('📊 Resources:'), result.summary.resourceCount);
        
        // Show resource breakdown
        const topResources = result.resources
          .sort((a, b) => b.monthlyCost - a.monthlyCost)
          .slice(0, 3);

        if (topResources.length > 0) {
          console.log(chalk.gray(`[${timestamp}]`), chalk.bold('Top Resources:'));
          topResources.forEach((resource, index) => {
            console.log(
              chalk.gray(`[${timestamp}]`),
              `  ${index + 1}. ${resource.resourceId}:`,
              chalk.green(OutputFormatter.formatCurrency(resource.monthlyCost))
            );
          });
        }

        console.log();
      } catch (error) {
        console.log(chalk.gray(`[${timestamp}]`), chalk.red('❌ Analysis failed:'), (error as Error).message);
        console.log();
      } finally {
        currentlyAnalyzing = false;
      }
    };

    // Debounced file change handler
    const handleFileChange = (filePath: string) => {
      if (analysisTimeout) {
        clearTimeout(analysisTimeout);
      }

      analysisTimeout = setTimeout(() => {
        analyzeFile(filePath);
      }, 500); // 500ms debounce
    };

    watcher.on('change', handleFileChange);
    watcher.on('add', handleFileChange);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log();
      console.log(chalk.yellow('Stopping file watcher...'));
      watcher.close();
      process.exit(0);
    });

    console.log(chalk.green('Watching for changes... (Press Ctrl+C to stop)'));
    console.log();
  });
