#!/usr/bin/env node

import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { watchCommand } from './commands/watch.js';
import { initCommand } from './commands/init.js';
// TODO: Enable in future version after implementing config system
// import { applyCommand } from './commands/apply.js';
// import { rollbackCommand } from './commands/rollback.js';

const program = new Command();

program
  .name('cloudverse')
  .description('CloudVerse CLI - Developer-native FinOps cost analysis tool')
  .version('1.0.1');

// Register commands
program.addCommand(analyzeCommand);
program.addCommand(watchCommand);
program.addCommand(initCommand);
// TODO: Enable in future version
// program.addCommand(applyCommand);
// program.addCommand(rollbackCommand);

// Add estimate as an alias for analyze
program
  .command('estimate')
  .description('Alias for analyze command')
  .argument('[files...]', 'Specific files to analyze')
  .option('-v, --verbose', 'Show detailed output')
  .option('-p, --provider <provider>', 'Cloud provider (aws, azure, gcp)')
  .option('-r, --region <region>', 'Deployment region')
  .action(async (files, options) => {
    await analyzeCommand.parseAsync(
      ['node', 'cloudverse', 'analyze', ...files, ...Object.entries(options).flatMap(([k, v]) => 
        typeof v === 'boolean' && v ? [`--${k}`] : [`--${k}`, String(v)]
      )],
      { from: 'user' }
    );
  });

program.parse(process.argv);
