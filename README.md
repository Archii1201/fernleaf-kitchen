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

## Project Structure

```text
apps/
  api/       NestJS backend
  web/       Next.js frontend

packages/
  shared/    Shared types/contracts

prisma/      Prisma configuration/schema

docs/        Architecture and requirements documentation

scripts/     Development and deployment scripts
