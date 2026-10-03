# Fernleaf Kitchen

Full-stack corporate meal operations admin panel.

## Stack

- Next.js
- NestJS
- Prisma
- PostgreSQL
- TypeScript

## Architecture

The application uses a modular monolith architecture.

Frontend:
Next.js

Backend:
NestJS

Database:
PostgreSQL through Prisma

The domain data model lives in `apps/api/prisma/schema.prisma` and is explained in
`docs/explanation/step3.md`. Constraints that Prisma cannot express are kept in
`apps/api/prisma/sql/postgres_constraints.sql`.

## Project Structure

```text
apps/
  api/       NestJS backend
  web/       Next.js frontend

packages/
  shared/    Shared types/contracts

prisma/      Prisma configuration/schema


scripts/     Development and deployment scripts

docs/
  explanation/   Step-by-step design notes
