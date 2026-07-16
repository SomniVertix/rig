module.exports = {
  forbidden: [
    {
      name: "engine-cannot-import-outside-schema",
      severity: "error",
      from: { path: "packages/engine" },
      to: { 
        path: "packages/(persistence|executors|library|server)",
        pathNot: ["packages/schema"]
      }
    },
    {
      name: "engine-cannot-import-outside-schema-via-index",
      severity: "error",
      from: { pathNot: ["packages/engine"] },
      to: { path: "packages/engine" },
      via: { path: "packages/(persistence|executors|library|server)" }
    }
  ],
  options: {
    doNotFollow: ["node_modules", ".pnpm"],
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
      mainFields: ["exports", "types", "main"]
    }
  }
};
