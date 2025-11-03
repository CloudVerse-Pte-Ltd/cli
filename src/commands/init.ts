import { Command } from 'commander';
import prompts from 'prompts';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import yaml from 'yaml';
import chalk from 'chalk';
import { OutputFormatter } from '../utils/formatter.js';

export const initCommand = new Command('init')
  .description('Initialize CloudVerse configuration')
  .option('--global', 'Initialize global configuration in ~/.cloudverse')
  .action(async (options) => {
    console.log();
    console.log(chalk.bold.cyan('🚀 CloudVerse CLI Initialization'));
    console.log();

    try {
      // Prompt for configuration
      const response = await prompts([
        {
          type: 'text',
          name: 'apiUrl',
          message: 'API endpoint URL:',
          initial: 'http://localhost:5000',
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'API key (optional):',
          initial: '',
        },
        {
          type: 'select',
          name: 'defaultProvider',
          message: 'Default cloud provider:',
          choices: [
            { title: 'AWS', value: 'aws' },
            { title: 'Azure', value: 'azure' },
            { title: 'GCP', value: 'gcp' },
          ],
          initial: 0,
        },
        {
          type: 'text',
          name: 'defaultRegion',
          message: 'Default region:',
          initial: 'us-east-1',
        },
        {
          type: 'number',
          name: 'budget',
          message: 'Monthly budget (USD):',
          initial: 5000,
        },
      ]);

      if (!response.apiUrl) {
        OutputFormatter.printError('Configuration cancelled');
        return;
      }

      const config = {
        api: {
          endpoint: response.apiUrl,
          ...(response.apiKey && { key: response.apiKey }),
          timeout: '30s',
        },
        defaults: {
          provider: response.defaultProvider,
          region: response.defaultRegion,
          environment: 'development',
          currency: 'USD',
        },
        budget: {
          monthly: response.budget,
          alertThreshold: 80, // Alert at 80% of budget
        },
        thresholds: {
          warning: 100.00,
          critical: 500.00,
        },
      };

      // Determine config file location
      let configPath: string;
      if (options.global) {
        const cloudverseDir = join(homedir(), '.cloudverse');
        await mkdir(cloudverseDir, { recursive: true });
        configPath = join(cloudverseDir, 'config.yaml');
      } else {
        configPath = join(process.cwd(), '.cloudverse.yaml');
      }

      // Write config file
      await writeFile(configPath, yaml.stringify(config), 'utf-8');

      OutputFormatter.printSuccess(`Configuration saved to ${configPath}`);

      console.log(chalk.bold('Next steps:'));
      console.log(`  1. Run ${chalk.cyan('cloudverse analyze')} to analyze your infrastructure`);
      console.log(`  2. Run ${chalk.cyan('cloudverse watch')} to monitor file changes`);
      console.log(`  3. Run ${chalk.cyan('cloudverse --help')} to see all available commands`);
      console.log();

    } catch (error) {
      OutputFormatter.printError('Failed to initialize configuration', error as Error);
      process.exit(1);
    }
  });
