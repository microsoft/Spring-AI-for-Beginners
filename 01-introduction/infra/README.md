# Azure Infrastructure for Spring AI Getting Started

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture](#architecture)
- [Resources Created](#resources-created)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Updating Infrastructure](#updating-infrastructure)
- [Cost Optimization](#cost-optimization)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Clean Up](#clean-up)
- [File Structure](#file-structure)
- [Security Recommendations](#security-recommendations)
- [Summary](#summary)

This directory contains the Azure infrastructure as code (IaC) using Bicep and Azure Developer CLI (azd) for deploying Microsoft Foundry resources.

## Prerequisites

- [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) (version 2.50.0 or later)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (version 1.5.0 or later)
- An Azure subscription with permissions to create resources

## Architecture

**Simplified Local Development Setup** - Deploy Microsoft Foundry only, run all apps locally.

The infrastructure deploys the following Azure resources:

### AI Services
- **Microsoft Foundry**: Cognitive Services with three model deployments:
  - **gpt-5.2**: Reasoning chat model used by Module 02 (prompt engineering)
  - **gpt-5.6-luna**: Fast, low-latency chat model used by all other modules (01, 03, 04, 05, 06)
  - **text-embedding-3-small**: Embedding model for RAG (Module 03)

### Local Development
All Spring Boot applications run locally on your machine:
- 01-introduction (port 8080)
- 02-prompt-engineering (port 8083)
- 03-rag (port 8081)
- 04-tools (port 8084)
- 05-mcp client (port 8082) / server (port 8085)
- 06-agents (port 8086)

## Resources Created

| Resource Type | Resource Name Pattern | Purpose |
|--------------|----------------------|---------|
| Resource Group | `rg-{environmentName}` | Contains all resources |
| Microsoft Foundry | `aoai-{resourceToken}` | AI model hosting |

> **Note:** `{resourceToken}` is a unique string generated from subscription ID, environment name, and location

## Quick Start

### 1. Deploy Microsoft Foundry

From the repository root:

**Bash:**
```bash
cd 01-introduction
azd up
```

**PowerShell:**
```powershell
cd 01-introduction
azd up
```

When prompted:
- Select your Azure subscription
- Choose a location for the resource group. The Foundry model region is configured separately in `infra/main.bicep` and defaults to `eastus2`.
- Confirm the environment name (default: `spring-ai-dev`)

This will create:
- Microsoft Foundry resource with GPT-5.2, gpt-5.6-luna, and text-embedding-3-small
- Output connection details

### 2. Get Connection Details

**Bash:**
```bash
azd env get-values
```

**PowerShell:**
```powershell
azd env get-values
```

This displays:
- `AZURE_OPENAI_ENDPOINT`: Your Microsoft Foundry endpoint URL
- `AZURE_OPENAI_KEY`: API key returned by `azd`; the post-provision scripts write this to `AZURE_OPENAI_API_KEY` in `.env` for local apps
- `AZURE_OPENAI_DEPLOYMENT`: Reasoning chat model name (gpt-5.2) — used by Module 02
- `AZURE_OPENAI_FAST_DEPLOYMENT`: Fast chat model name (gpt-5.6-luna) — used by all other modules
- `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`: Embedding model name

### 3. Run Applications Locally

The `azd up` command automatically creates a `.env` file in the root directory with all necessary environment variables.

**Recommended:** Start all web applications:

**Bash:**
```bash
# From the 01-introduction directory, return to the repository root
cd ..
./start-all.sh
```

**PowerShell:**
```powershell
# From the 01-introduction directory, return to the repository root
cd ..
.\start-all.ps1
```

Or start a single module:

**Bash:**
```bash
# From the 01-introduction directory, start just the introduction module
./start.sh
```

**PowerShell:**
```powershell
# From the 01-introduction directory, start just the introduction module
.\start.ps1
```

Both scripts automatically load environment variables from the root `.env` file created by `azd up`.

## Configuration

### Customizing Model Deployments

To change model deployments, edit `infra/main.bicep` and modify the `openAiDeployments` parameter:

```bicep
param openAiDeployments array = [
  {
    name: 'gpt-5.2'  // Reasoning model used by Module 02
    model: {
      format: 'OpenAI'
      name: 'gpt-5.2'
      version: '2025-12-11'
    }
    sku: {
      name: 'GlobalStandard'
      capacity: 10000
    }
  }
  {
    name: 'gpt-5.6-luna'  // Fast, low-latency model used by all other modules
    model: {
      format: 'OpenAI'
      name: 'gpt-5.6-luna'
      version: '2026-07-09'
    }
    sku: {
      name: 'GlobalStandard'
      capacity: 9000
    }
  }
  // Add more deployments...
]
```

Available models and versions: https://learn.microsoft.com/azure/ai-services/openai/concepts/models

### Changing Azure Regions

To deploy Microsoft Foundry in a different model region, edit `infra/main.bicep`:

```bicep
param openAiLocation string = 'eastus2'  // or other GPT-5.2 region
```

The `azd` location prompt controls the resource group location; `openAiLocation` controls where the Foundry resource and model deployments are created.

Check GPT-5.2 availability: https://learn.microsoft.com/azure/ai-services/openai/concepts/models#model-summary-table-and-region-availability

## Updating Infrastructure

To update the infrastructure after making changes to Bicep files:

**Bash:**
```bash
# Rebuild the ARM template
az bicep build --file infra/main.bicep

# Preview changes
azd provision --preview

# Apply changes
azd provision
```

**PowerShell:**
```powershell
# Rebuild the ARM template
az bicep build --file infra/main.bicep

# Preview changes
azd provision --preview

# Apply changes
azd provision
```

## Cost Optimization

### Development/Testing
For dev/test environments, you can reduce costs:
- Use Standard tier (S0) for Microsoft Foundry
- Lower deployment capacities in `infra/main.bicep` if your quota and traffic allow it
- Delete resources when not in use: `azd down`

### Production
For production:
- Increase deployment capacities based on usage and quota
- Enable zone redundancy for higher availability
- Implement proper monitoring and cost alerts

### Cost Estimation
- Microsoft Foundry: Pay-per-token (input + output)
- GPT-5.2: ~$3-5 per 1M tokens (check current pricing)
- text-embedding-3-small: ~$0.02 per 1M tokens

Pricing calculator: https://azure.microsoft.com/pricing/calculator/

## Monitoring

### View Microsoft Foundry Metrics

Go to Azure Portal → Your OpenAI resource → Metrics:
- Token-Based Utilization
- HTTP Request Rate
- Time To Response
- Active Tokens

## Troubleshooting

### Issue: Microsoft Foundry subdomain name conflict

**Error Message:**
```
ERROR CODE: CustomDomainInUse
message: "Please pick a different name. The subdomain name 'aoai-xxxxx' 
is not available as it's already used by a resource."
```

**Cause:**
The subdomain name generated from your subscription/environment is already in use, possibly from a previous deployment that wasn't fully purged.

**Solution:**
1. **Option 1 - Use a different environment name:**
   
   **Bash:**
   ```bash
   azd env new my-unique-env-name
   azd up
   ```
   
   **PowerShell:**
   ```powershell
   azd env new my-unique-env-name
   azd up
   ```

2. **Option 2 - Manual deployment via Azure Portal:**
   - Go to Azure Portal → Create a resource → Microsoft Foundry
   - Choose a unique name for your resource
   - Deploy the following models:
     - **GPT-5.2**
     - **gpt-5.6-luna** (used by modules 01, 03, 04, 05, 06 for fast, low-latency chat)
     - **text-embedding-3-small** (for RAG modules)
   - **Important:** Note your deployment names - they must match `.env` configuration
   - After deployment, get your endpoint and API key from "Keys and Endpoint"
   - Create a `.env` file in the project root with:
     
     **Example `.env` file:**
     ```bash
     AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
     AZURE_OPENAI_API_KEY=your-api-key-here
     AZURE_OPENAI_DEPLOYMENT=gpt-5.2
     AZURE_OPENAI_FAST_DEPLOYMENT=gpt-5.6-luna
     AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
     ```

**Model Deployment Naming Guidelines:**
- Use simple, consistent names: `gpt-5.2`, `gpt-5.6-luna`, `text-embedding-3-small`
- Deployment names must match exactly what you configure in `.env`
- Common mistake: Creating model with one name but referencing different name in code

### Issue: GPT-5.2 not available in selected region

**Solution:**
- Choose a region with GPT-5.2 access (e.g., eastus2)
- Check availability: https://learn.microsoft.com/azure/ai-services/openai/concepts/models

### Issue: Insufficient quota for deployment

**Solution:**
1. Request quota increase in Azure Portal
2. Or reduce the affected deployment capacity in `main.bicep`

### Issue: "Resource not found" when running locally

**Solution:**
1. Verify deployment: `azd env get-values`
2. Check endpoint and key are correct
3. Ensure resource group exists in Azure Portal

### Issue: Authentication failed

**Solution:**
- Verify `AZURE_OPENAI_API_KEY` is set correctly
- Key format should be 32-character hexadecimal string
- Get new key from Azure Portal if needed

### Deployment Fails

**Issue**: `azd provision` fails with quota or capacity errors

**Solution**: 
1. Try a different region - See [Changing Azure Regions](#changing-azure-regions) section for how to configure regions
2. Check your subscription has Microsoft Foundry quota:
   
   **Bash:**
   ```bash
   az cognitiveservices account list-skus --location <your-region>
   ```
   
   **PowerShell:**
   ```powershell
   az cognitiveservices account list-skus --location <your-region>
   ```

### Application Not Connecting

**Issue**: Java application shows connection errors

**Solution**:
1. Verify environment variables are exported:
   
   **Bash:**
   ```bash
   echo $AZURE_OPENAI_ENDPOINT
   echo $AZURE_OPENAI_API_KEY
   ```
   
   **PowerShell:**
   ```powershell
   Write-Host $env:AZURE_OPENAI_ENDPOINT
   Write-Host $env:AZURE_OPENAI_API_KEY
   ```

2. Check endpoint format is correct (should be `https://xxx.openai.azure.com`)
3. Verify API key is the primary or secondary key from Azure Portal

**Issue**: 401 Unauthorized from Microsoft Foundry

**Solution**:
1. Get a fresh API key from Azure Portal → Keys and Endpoint
2. Re-export the `AZURE_OPENAI_API_KEY` environment variable
3. Ensure model deployments are complete (check Azure Portal)

### Performance Issues

**Issue**: Slow response times

**Solution**:
1. Check OpenAI token usage and throttling in Azure Portal metrics
2. Increase TPM capacity if you're hitting limits
3. Use lower reasoning effort or `gpt-5.6-luna` when full reasoning is not needed

## Clean Up

To delete all resources:

**Bash:**
```bash
# Delete all resources
azd down

# Delete everything including the environment
azd down --purge
```

**PowerShell:**
```powershell
# Delete all resources
azd down

# Delete everything including the environment
azd down --purge
```

**Warning**: This will permanently delete all Azure resources.

## File Structure

```
infra/
├── main.bicep                       # Main infrastructure definition
├── main.json                        # Compiled ARM template (auto-generated)
├── main.bicepparam                  # Parameter file
├── README.md                        # This file
└── core/
    └── ai/
        └── cognitiveservices.bicep  # Microsoft Foundry module
```

## Security Recommendations

1. **Never commit API keys** - Use environment variables
2. **Use .env files locally** - Add `.env` to `.gitignore`
3. **Rotate keys regularly** - Generate new keys in Azure Portal
4. **Limit access** - Use Azure RBAC to control who can access resources
5. **Monitor usage** - Set up cost alerts in Azure Portal

## Summary

This infrastructure deploys a single Microsoft Foundry resource — with `gpt-5.2`, `gpt-5.6-luna`, and `text-embedding-3-small` deployments — using Bicep and the Azure Developer CLI (`azd`). Running `azd up` from the `01-introduction` directory provisions the resource and writes a root `.env` file that every module reads, so all Spring Boot apps run locally against the same shared backend. Use the configuration, cost, monitoring, and troubleshooting sections above to customize regions and capacity, control spend, and diagnose common deployment issues. When you're finished, `azd down` removes everything.

---

**Navigation:** [← Back to Module 01 - Introduction](../README.md)
