# Operator → Task → My Companies

This stacked change depends on PR #9. The original Vite app is missing from this repository, so this is source-level integration code and not a production deployment.

Migrations: sql/016 operator application, sql/017 company tasks and manual outcome journal, sql/018 My Companies history. UI: src/operator-company-workflows.mjs.

The applicant provides name, country, languages and phone after Google login and before approval. Admin reviews the profile and assigns a company task by approved operator ID. Worker records a real, self-reported contact result and optional callback time. My Companies searches own current and past contacted companies, with own notes and follow-ups on click.

Personal DAVID audio analysis and AI guidance are a future phase, not part of this change.
