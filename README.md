# CloudVerse CLI

Developer-native FinOps cost analysis tool for infrastructure-as-code.

## Installation

```bash
# From the cli directory
npm install
npm run build

# Link globally for development
npm link

# Or install from npm (when published)
npm install -g @cloudverse.ai/cli
```

## Quick Start

```bash
# Initialize configuration
cloudverse init

# Analyze current directory
cloudverse analyze

# Analyze specific files
cloudverse analyze infrastructure/*.tf

# Watch for file changes
cloudverse watch

# Get detailed output
cloudverse analyze --verbose
```

## Commands

### `cloudverse init`

Initialize CloudVerse configuration. Creates a `.cloudverse.yaml` file with your settings.

```bash
cloudverse init          # Local configuration
cloudverse init --global # Global configuration (~/.cloudverse/config.yaml)
```

### `cloudverse analyze`

Analyze infrastructure files and estimate costs.

```bash
cloudverse analyze [files...]

Options:
  -v, --verbose              Show detailed output with SKU breakdowns
  -p, --provider <provider>  Cloud provider (aws, azure, gcp)
  -r, --region <region>      Deployment region
  -o, --output <file>        Save report to file (JSON format)

Examples:
  cloudverse analyze                    # Analyze all files in current directory
  cloudverse analyze main.tf           # Terraform file
  cloudverse analyze template.yaml     # CloudFormation file
  cloudverse analyze cdk.json          # AWS CDK file
  cloudverse analyze my-chart/         # Helm chart directory
  cloudverse analyze --verbose         # Show detailed breakdown
  cloudverse analyze -p aws -r us-east-1
```

### `cloudverse watch`

Watch infrastructure files for changes and provide real-time cost feedback.

```bash
cloudverse watch [directories...]

Options:
  -p, --provider <provider>  Cloud provider (aws, azure, gcp)
  -r, --region <region>      Deployment region

Examples:
  cloudverse watch                # Watch current directory
  cloudverse watch infrastructure/ # Watch specific directory
```

### `cloudverse estimate`

Alias for the `analyze` command.

```bash
cloudverse estimate [files...]
```

## Configuration

Configuration can be stored in:
- `.cloudverse.yaml` (project-specific)
- `~/.cloudverse/config.yaml` (global)

Example configuration:

```yaml
api:
  endpoint: http://localhost:5000
  key: your-api-key
  timeout: 30s

defaults:
  provider: aws
  region: us-east-1
  environment: development
  currency: USD

budget:
  monthly: 5000
  alertThreshold: 80

thresholds:
  warning: 100.00
  critical: 500.00
```

## Environment Variables

- `CLOUDVERSE_API_URL` - API endpoint URL (default: http://localhost:5000)
- `CLOUDVERSE_API_KEY` - API authentication key

## Output Examples

### Basic Analysis

```
🔍 CloudVerse Cost Analysis

💰 Cost Summary:
  Total Monthly Cost: $2,847.50
  Resources Found: 12

📊 Resource Breakdown:
┌─────────────────┬───────┬──────────────┬────────────┐
│ Resource Type   │ Count │ Monthly Cost │ % of Total │
├─────────────────┼───────┼──────────────┼────────────┤
│ ec2             │ 3     │ $1,245.60    │ +43.7%     │
│ rds             │ 1     │ $890.25      │ +31.3%     │
│ s3              │ 2     │ $89.40       │ +3.1%      │
└─────────────────┴───────┴──────────────┴────────────┘

💡 Tips:
  • Run cloudverse analyze --verbose for detailed resource breakdown
  • Use cloudverse watch to monitor file changes in real-time
```

### Verbose Analysis

Shows detailed resource information including SKU breakdowns, instance types, storage sizes, and cost drivers.

### Watch Mode

```
👀 CloudVerse File Watcher Started

📂 Watching: infrastructure/

Watching for changes... (Press Ctrl+C to stop)

[14:32:15] File changed: infrastructure/web-tier.tf
[14:32:17] 🔍 Analyzing...
[14:32:19] ✅ Analysis complete (2.1s)
[14:32:19] 💰 Total Monthly Cost: $2,920.70
[14:32:19] 📊 Resources: 13
[14:32:19] Top Resources:
[14:32:19]   1. aws_instance.web_server: $156.80
[14:32:19]   2. aws_rds_instance.database: $890.25
[14:32:19]   3. aws_lb.application: $156.80
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- analyze

# Build
npm run build

# Test locally
npm link
cloudverse --help
```

## Supported Infrastructure Formats

- ✅ Terraform (.tf files)
- ✅ CloudFormation (YAML/JSON)
- ✅ AWS CDK (JSON)
- ✅ Helm Charts (Chart.yaml + templates)
- 🚧 Pulumi - Coming soon

## Supported Cloud Providers

- ✅ AWS (Amazon Web Services)
- ✅ Azure (Microsoft Azure)
- ✅ GCP (Google Cloud Platform)

## License

MIT
