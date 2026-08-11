## Production Deployment Process

1. Merge to `main` triggers the CI job automatically.
2. If CI passes, the `deploy` job requests approval via the `production` GitHub environment.
3. A designated maintainer reviews and approves the deployment in the Actions tab (Actions → workflow run → Review deployments).
4. Once approved, the deploy job runs using secrets scoped only to the `production` environment.
5. Deployment status and URL are visible on the workflow run summary.