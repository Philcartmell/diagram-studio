// Hand-written additions to the Databricks icon catalog: everyday names and former
// product names people still use, mapped to the pack's product slugs. Former names
// recorded in the pack itself ("aka") are added by the build automatically.
//
// [slug, [aliases]]
export const ALIASES = [
  ['databricks', ['databricks-logo', 'databricks-platform']],
  ['data-intelligence-platform', ['data-intelligence']],
  ['apache-spark', ['spark']],
  ['compute-clusters', ['clusters', 'cluster', 'compute', 'all-purpose-compute', 'jobs-compute', 'classic-compute']],
  ['serverless-compute', ['serverless']],
  ['spark-declarative-pipelines', ['lakeflow-declarative-pipelines', 'declarative-pipelines', 'delta-live-tables', 'dlt', 'ldp', 'sdp']],
  ['lakeflow-jobs', ['jobs', 'workflows', 'databricks-workflows']],
  ['auto-loader', ['autoloader']],
  ['delta-lake', ['delta']],
  ['apache-iceberg', ['iceberg']],
  ['lakehouse-storage', ['managed-tables']],
  ['databricks-sql', ['dbsql']],
  ['sql-warehouse', ['sql-warehouses', 'dbsql-warehouse']],
  ['ai-bi-dashboards', ['dashboards', 'lakeview', 'lakeview-dashboards']],
  ['lakehouse-federation', ['federation', 'query-federation']],
  ['genie-agents', ['genie-spaces', 'ai-bi-genie']],
  ['ai-search', ['vector-search', 'mosaic-ai-vector-search']],
  ['model-serving', ['mosaic-ai-model-serving', 'serving-endpoints']],
  ['mlflow', ['managed-mlflow']],
  ['feature-store', ['feature-engineering']],
  ['unity-catalog', ['uc']],
  ['data-lineage', ['lineage']],
  ['abac', ['attribute-based-access-control']],
  ['data-quality-monitoring', ['lakehouse-monitoring']],
  ['clean-rooms', ['clean-room']],
  ['marketplace', ['databricks-marketplace']],
  ['databricks-apps', ['apps']],
  ['notebooks', ['notebook']],
  ['workspace', ['databricks-workspace']],
  ['git-folders', ['repos']],
  ['asset-bundles', ['bundles', 'dabs', 'databricks-asset-bundles']],
];
