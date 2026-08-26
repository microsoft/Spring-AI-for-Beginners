targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment used for resource naming')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

// OpenAI parameters
@description('Location for Microsoft Foundry resource')
param openAiLocation string = 'eastus2'

@description('SKU name for Microsoft Foundry')
param openAiSkuName string = 'S0'

@description('Model deployments for Microsoft Foundry')
param openAiDeployments array = [
  {
    name: 'gpt-5.2'
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
    name: 'gpt-5-nano'
    model: {
      format: 'OpenAI'
      name: 'gpt-5-nano'
      version: '2025-08-07'
    }
    sku: {
      name: 'GlobalStandard'
      capacity: 30000
    }
  }
  {
    name: 'text-embedding-3-small'
    model: {
      format: 'OpenAI'
      name: 'text-embedding-3-small'
      version: '1'
    }
    sku: {
      name: 'Standard'
      capacity: 20
    }
  }
]

// Tags
var tags = {
  'azd-env-name': environmentName
}

// Generate unique token for resource naming
var resourceToken = uniqueString(subscription().id, environmentName, location)

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

// Microsoft Foundry (AI Services, formerly Cognitive Services multi-service)
module openAi 'core/ai/cognitiveservices.bicep' = {
  name: 'openai'
  scope: rg
  params: {
    name: 'aoai-${resourceToken}'
    location: openAiLocation
    tags: tags
    kind: 'AIServices'
    sku: openAiSkuName
    deployments: openAiDeployments
  }
}

// Outputs
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP_ID string = rg.id
output AZURE_RESOURCE_GROUP_NAME string = rg.name

output AZURE_OPENAI_ENDPOINT string = openAi.outputs.endpoint
output AZURE_OPENAI_DEPLOYMENT string = 'gpt-5.2'
output AZURE_OPENAI_FAST_DEPLOYMENT string = 'gpt-5-nano'
output AZURE_OPENAI_EMBEDDING_DEPLOYMENT string = 'text-embedding-3-small'
output AZURE_OPENAI_NAME string = openAi.outputs.name
output AZURE_OPENAI_KEY string = openAi.outputs.key
