import chalk from 'chalk';
import Table from 'cli-table3';
import type { AnalyzeResponse } from '../lib/api-client.js';

export class OutputFormatter {
  static formatCurrency(amount: number | string | null | undefined): string {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
    return `$${numAmount.toFixed(2)}`;
  }

  static formatPercentage(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }

  static printAnalysisSummary(result: AnalyzeResponse, options: {
    verbose?: boolean;
    showBreakdown?: boolean;
  } = {}) {
    console.log();
    console.log(chalk.bold.cyan('🔍 CloudVerse Cost Analysis'));
    console.log();
    
    // Summary section
    console.log(chalk.bold('💰 Cost Summary:'));
    console.log(`  Total Monthly Cost: ${chalk.bold.green(this.formatCurrency(result.totalCost))}`);
    console.log(`  Resources Found: ${chalk.bold(result.summary.resourceCount)}`);
    console.log();

    // Resource breakdown by type
    if (options.showBreakdown !== false) {
      console.log(chalk.bold('📊 Resource Breakdown:'));
      
      const table = new Table({
        head: [
          chalk.bold('Resource Type'),
          chalk.bold('Count'),
          chalk.bold('Monthly Cost'),
          chalk.bold('% of Total')
        ],
        style: { head: [] },
      });

      const sortedTypes = Object.entries(result.summary.byCost)
        .sort(([, a], [, b]) => b - a);

      for (const [type, cost] of sortedTypes) {
        const count = result.summary.byType[type] || 0;
        const percentage = (cost / result.totalCost) * 100;
        
        table.push([
          type,
          count.toString(),
          this.formatCurrency(cost),
          this.formatPercentage(percentage)
        ]);
      }

      console.log(table.toString());
      console.log();
    }

    // Detailed resource list
    if (options.verbose) {
      console.log(chalk.bold('📝 Detailed Resources:'));
      console.log();

      for (const resource of result.resources) {
        console.log(chalk.bold(`  ${resource.resourceId}`));
        console.log(`    Type: ${resource.resourceType}`);
        console.log(`    Region: ${resource.region}`);
        console.log(`    Monthly Cost: ${chalk.green(this.formatCurrency(resource.monthlyCost))}`);
        
        if (resource.skuBreakdown && resource.skuBreakdown.length > 0) {
          console.log(`    SKU Breakdown:`);
          for (const sku of resource.skuBreakdown) {
            console.log(`      - ${sku.sku}: ${sku.quantity} ${sku.unit} × ${this.formatCurrency(sku.unitPrice)} = ${chalk.green(this.formatCurrency(sku.cost))}`);
          }
        }
        console.log();
      }
    }

    // Optimization recommendations
    if (result.recommendations && result.recommendations.length > 0) {
      console.log(chalk.bold.yellow('💡 Optimization Recommendations:'));
      console.log();

      // Calculate total savings using only primary recommendations (one per resource)
      const totalSavings = result.recommendations
        .filter(rec => rec.isPrimary === true)
        .reduce((sum, rec) => sum + (Number(rec.potentialMonthlySavings) || 0), 0);

      // Group recommendations by resource
      const byResource = new Map<string, typeof result.recommendations>();
      for (const rec of result.recommendations) {
        const existing = byResource.get(rec.resourceId) || [];
        existing.push(rec);
        byResource.set(rec.resourceId, existing);
      }

      // Count unique resources with recommendations
      const resourcesWithRecs = byResource.size;

      console.log(`  ${chalk.bold('Potential Savings:')} ${chalk.bold.green(this.formatCurrency(totalSavings))}/month (${chalk.green(this.formatCurrency(totalSavings * 12))}/year)`);
      console.log(`  ${chalk.bold('Resources with Recommendations:')} ${resourcesWithRecs}`);
      console.log(`  ${chalk.bold('Total Recommendation Options:')} ${result.recommendations.length}`);
      console.log();

      // Get top resources by primary recommendation savings
      const sortedResources = Array.from(byResource.entries())
        .map(([resourceId, recs]) => {
          const primaryRec = recs.find(r => r.isPrimary === true) || recs[0];
          return { resourceId, recommendations: recs, primaryRec };
        })
        .sort((a, b) => (Number(b.primaryRec.potentialMonthlySavings) || 0) - (Number(a.primaryRec.potentialMonthlySavings) || 0))
        .slice(0, 5);

      for (const { resourceId, recommendations, primaryRec } of sortedResources) {
        // Show primary recommendation
        console.log(chalk.bold.cyan(`  ${resourceId}`));
        console.log(chalk.green(`    ★ PRIMARY: ${primaryRec.title}`));
        console.log(`      Savings: ${chalk.green(this.formatCurrency(primaryRec.potentialMonthlySavings))}/mo | Effort: ${primaryRec.effortRequired} | Risk: ${primaryRec.riskLevel}`);
        
        // Show alternative recommendations if any
        const alternatives = recommendations.filter(r => r.isPrimary !== true);
        if (alternatives.length > 0) {
          console.log(chalk.dim(`      +${alternatives.length} alternative option(s):`));
          for (const alt of alternatives) {
            console.log(chalk.dim(`        • ${alt.title} (${this.formatCurrency(alt.potentialMonthlySavings)}/mo)`));
          }
        }
        console.log();
      }

      if (byResource.size > 5) {
        console.log(chalk.dim(`  Showing top 5 of ${byResource.size} resources with recommendations`));
        console.log();
      }
    }

    // Quick tips
    console.log(chalk.bold.yellow('💡 Tips:'));
    console.log(`  • Run ${chalk.cyan('cloudverse analyze --verbose')} for detailed resource breakdown`);
    console.log(`  • Use ${chalk.cyan('cloudverse watch')} to monitor file changes in real-time`);
    console.log();
  }

  static printError(message: string, error?: Error) {
    console.error();
    console.error(chalk.bold.red('❌ Error:'), message);
    if (error && error.message) {
      console.error(chalk.red(`   ${error.message}`));
    }
    console.error();
  }

  static printSuccess(message: string) {
    console.log();
    console.log(chalk.bold.green('✅'), message);
    console.log();
  }

  static printWarning(message: string) {
    console.log();
    console.log(chalk.bold.yellow('⚠️'), message);
    console.log();
  }

  static printInfo(message: string) {
    console.log(chalk.cyan('ℹ️'), message);
  }
}
