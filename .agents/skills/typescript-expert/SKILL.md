---
name: typescript-expert
description: Use when writing, reviewing, refactoring, testing, or debugging modern TypeScript 5.x+ code. Applies to Node.js, browser, full-stack, library, CLI, and framework-based TypeScript projects.
---

# TypeScript Expert

## Purpose

Produce correct, maintainable, type-safe TypeScript code that fits the existing project. Priorities, in order:

1. Correctness
2. Type safety
3. Simplicity
4. Maintainability
5. Runtime safety at boundaries
6. Consistency with the repository
7. Minimal, justified dependencies

Repository conventions always override the generic guidance in this document.

## 1. First Steps For Any Task

Before editing, inspect:

1. `package.json`: scripts, dependencies, `type` field
2. `tsconfig.json`: strict flags, module system, paths
3. Existing source files near the change: match style
4. Test files: match testing framework and patterns
5. Lint/format configs: `.eslintrc`, `.prettierrc`, `eslint.config.*`, `prettier.config.*`
6. Lockfile to detect package manager:
   - `pnpm-lock.yaml` -> `pnpm`
   - `yarn.lock` -> `yarn`
   - `package-lock.json` -> `npm`
   - `bun.lock` / `bun.lockb` -> `bun`

Determine:

- Runtime: Node.js, browser, edge, Deno, Bun
- Module system: ESM, CommonJS, or mixed
- Framework: React, Next.js, library, CLI, etc.
- Test runner: Vitest, Jest, Node test runner, Playwright

Do not rewrite architecture or change configurations unless the task requires it.

## 2. Core Type System Rules

### 2.1 Never Use any; Prefer unknown

`any` disables the type checker. `unknown` forces safe narrowing.

```ts
// BAD
function parseConfig(raw: any): Config {
  return raw.config;
}

// GOOD
function parseConfig(raw: unknown): Config {
  if (!isConfig(raw)) {
    throw new TypeError(`Invalid config: ${JSON.stringify(raw)}`);
  }
  return raw;
}
```

If `any` is truly unavoidable, isolate it and add a comment explaining why.

### 2.2 Never Use @ts-ignore

Use `@ts-expect-error` with a description when absolutely needed. This surfaces if the underlying issue is fixed.

### 2.3 Treat All External Input As unknown

Anything from outside the program is untrusted:

- HTTP requests/responses
- JSON files
- Environment variables
- Database rows
- CLI args
- Third-party API responses
- `localStorage`, message queues, user input

```ts
// BAD
const user = (await response.json()) as User;

// GOOD
const data: unknown = await response.json();
const user = UserSchema.parse(data);
```

### 2.4 Explicit Types At Public Boundaries

Infer internally; annotate exports.

```ts
// BAD: return type inferred at public boundary
export function getUser(id: string) {
  return db.query(`SELECT * FROM users WHERE id = ?`, [id]);
}

// GOOD
export async function getUser(id: string): Promise<User | null> {
  return db.query<User>(`SELECT * FROM users WHERE id = ?`, [id]);
}
```

### 2.5 Discriminated Unions Over Optional-Field Soup

```ts
// BAD: invalid states are representable
interface RequestState {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: User;
  error?: Error;
}

// GOOD: each state is unambiguous
type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User }
  | { status: 'error'; error: Error };
```

### 2.6 Exhaustiveness Checks With never

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}

function render(state: RequestState): string {
  switch (state.status) {
    case 'idle':
      return 'Ready';
    case 'loading':
      return 'Loading...';
    case 'success':
      return `Hello, ${state.data.name}`;
    case 'error':
      return `Error: ${state.error.message}`;
    default:
      return assertNever(state);
  }
}
```

### 2.7 Avoid enum; Use as const Objects

TypeScript `enum` produces runtime output and can surprise bundlers/transpilers. Follow repository convention if enums are already an explicit project policy.

```ts
export const Status = {
  Pending: 'PENDING',
  Active: 'ACTIVE',
  Closed: 'CLOSED',
} as const;

export type Status = (typeof Status)[keyof typeof Status];
```

### 2.8 Use satisfies For Shape Validation Without Widening

```ts
const routes = {
  home: '/',
  users: '/users',
  settings: '/settings',
} as const satisfies Record<string, `/${string}`>;
```

### 2.9 Branded Types For Domain Primitives

Use sparingly for IDs, tokens, currency, or values easily confused.

```ts
declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

type UserId = Brand<string, 'UserId'>;
type PostId = Brand<string, 'PostId'>;

function UserId(raw: string): UserId {
  if (!/^usr_[a-z0-9]{16}$/.test(raw)) {
    throw new Error(`Invalid UserId: "${raw}"`);
  }
  return raw as UserId;
}
```

### 2.10 interface vs type

- Use `interface` for object shapes intended to be extended/implemented.
- Use `type` for unions, intersections, mapped/conditional types, and branded types.
- Follow the existing project convention if one is established.
- Do not prefix interfaces with `I`; use `User`, not `IUser`.

## 3. Runtime Validation

Use schema validation at every system boundary. Prefer libraries already in the project: Zod, Valibot, ArkType, TypeBox. Do not add one without justification.

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof EnvSchema>;
export const env = EnvSchema.parse(process.env);
```

## 4. Error Handling

### 4.1 Never Swallow Errors

```ts
// BAD
try {
  await saveUser(user);
} catch {}

// GOOD
try {
  await saveUser(user);
} catch (error) {
  logger.error({ error }, 'Failed to save user');
  throw error;
}
```

### 4.2 Caught Errors Are unknown

```ts
try {
  await task();
} catch (error: unknown) {
  if (error instanceof Error) {
    throw new Error(`Task failed: ${error.message}`, { cause: error });
  }
  throw new Error('Task failed with non-Error value');
}
```

### 4.3 Typed Application Errors

```ts
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found`, 'NOT_FOUND', { resource, id });
  }
}
```

### 4.4 Result Type For Expected Failures

For predictable business-logic failures such as validation and not-found cases, prefer returning `Result` over throwing.

```ts
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

async function fetchUser(id: UserId): Promise<Result<User, 'NOT_FOUND' | 'DB_ERROR'>> {
  try {
    const user = await db.users.findById(id);
    return user ? Ok(user) : Err('NOT_FOUND');
  } catch {
    return Err('DB_ERROR');
  }
}
```

Reserve `throw` for programmer errors and unrecoverable conditions.

## 5. Async Patterns

### 5.1 Never Float Promises

```ts
// BAD: error silently lost
function deleteUser(id: UserId) {
  db.users.delete(id);
  cache.invalidate(id);
}

// GOOD
async function deleteUser(id: UserId): Promise<void> {
  await db.users.delete(id);
  await cache.invalidate(id);
}
```

### 5.2 Concurrent Independent Operations

```ts
const [user, settings] = await Promise.all([
  getUser(userId),
  getSettings(userId),
]);

const results = await Promise.allSettled([fetchA(), fetchB(), fetchC()]);
```

### 5.3 No forEach With Async Callbacks

```ts
// BAD
items.forEach(async (item) => {
  await processItem(item);
});

// GOOD: sequential
for (const item of items) {
  await processItem(item);
}

// GOOD: concurrent
await Promise.all(items.map(processItem));
```

### 5.4 Cancellation With AbortSignal

```ts
async function fetchUser(id: string, signal?: AbortSignal): Promise<User> {
  const response = await fetch(`/api/users/${id}`, { signal });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return UserSchema.parse(await response.json());
}
```

### 5.5 Streaming Large Data With Async Iterators

```ts
async function* streamRows(query: string): AsyncGenerator<Row[]> {
  let cursor: string | null = null;
  do {
    const page = await db.query<Row[]>(query, { cursor, limit: 500 });
    yield page.rows;
    cursor = page.nextCursor;
  } while (cursor !== null);
}
```

## 6. Modules And Imports

### 6.1 Prefer ESM With node: Prefixes

```ts
import { readFile } from 'node:fs/promises';
import type { User } from './types';
```

### 6.2 Type-Only Imports

```ts
import type { User } from './user.types';
```

### 6.3 Path Aliases Over Deep Relative Paths

If the project uses `tsconfig.json` paths, prefer them:

```ts
// GOOD
import { UserService } from '@features/users';

// BAD when aliases exist
import { UserService } from '../../../features/users/user.service';
```

### 6.4 No CommonJS In ESM Projects; No namespace

Modern projects should use ES modules. Avoid TypeScript `namespace` unless the project explicitly depends on it.

## 7. Recommended tsconfig.json

If asked to modernize or initialize:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

For bundler-based apps, use `"module": "ESNext"`, `"moduleResolution": "Bundler"`, and add `"DOM"` to `lib` if browser APIs are used.

## 8. Testing

Use the project's existing framework: Vitest, Jest, Node test runner, Playwright, etc.

### 8.1 Test Behavior, Not Implementation

```ts
it('returns active users sorted by name', () => {
  const result = getActiveUsers([
    { name: 'Zoe', active: true },
    { name: 'Ada', active: true },
    { name: 'Lin', active: false },
  ]);
  expect(result.map((u) => u.name)).toEqual(['Ada', 'Zoe']);
});
```

### 8.2 Cover Edge Cases

- Empty input
- Invalid input
- Boundary values
- Error paths
- Async failures
- Time zones / dates

### 8.3 Deterministic Tests

Avoid real network, real time, randomness, or global state in unit tests. Inject clocks and use fake timers.

### 8.4 Test Data Factories

```ts
function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: UserId('usr_test00000000001'),
    name: 'Test User',
    email: 'test@example.com',
    active: true,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}
```

## 9. Security

### 9.1 Validate All Input

Use Zod or equivalent at every boundary.

### 9.2 Avoid Injection

```ts
// BAD: shell injection
exec(`convert ${filename}`);

// GOOD
execFile('convert', [filename]);
```

Be careful with SQL, shell, HTML, URLs, file paths, regex, templates, and logs.

### 9.3 Never Log Secrets

```ts
// BAD
logger.info({ token }, 'User authenticated');

// GOOD
logger.info({ userId }, 'User authenticated');
```

### 9.4 Path Traversal

```ts
import path from 'node:path';

function resolveInside(baseDir: string, userPath: string): string {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, userPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Invalid path');
  }
  return resolved;
}
```

## 10. Framework-Specific Guidance

### 10.1 React

```tsx
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
}

export function Button({ children, variant = 'primary', onClick }: ButtonProps) {
  return (
    <button className={variant} onClick={onClick}>
      {children}
    </button>
  );
}
```

- Avoid `React.FC` unless the project uses it.
- Use exhaustive `useEffect` dependencies.
- Clean up effects with `AbortController`.
- Use discriminated unions for async state.
- Use `useMemo` / `useCallback` only when justified.

### 10.2 Node.js Backend

- Use `node:` prefixes for built-ins.
- Prefer `fs/promises` over callbacks.
- Use streams for large files.
- Use `execFile` / `spawn` with argument arrays; never shell string interpolation.
- Inject dependencies such as DB and logger into services for testability.

## 11. Common Mistakes

| Mistake | Correct Approach |
| --- | --- |
| `value as SomeType` | Type guard or runtime validation |
| `any` | `unknown` + narrowing |
| Floating promises | `await` or explicit `.catch` |
| Optional fields for state | Discriminated union |
| `try`/`catch` everywhere | `Result` type for expected failures |
| `JSON.parse` without validation | Schema `safeParse` + type guard |
| `enum` | `as const` object |
| `@ts-ignore` | `@ts-expect-error` with comment |
| `forEach(async ...)` | `for...of` or `Promise.all(map)` |
| Wide object / `{}` | Specific interface or `Record<K, V>` |
| Hard-coded `process.env.X` everywhere | Validated env schema at startup |
| Adding Lodash for `groupBy` | Small local helper |

## 12. Decision Tree

```text
Need to represent failure?
├── Expected (validation, not found) -> Result<T, E>
└── Programmer error / invariant     -> throw Error

Need optional data?
├── Might not exist           -> T | null
├── Multiple valid states     -> Discriminated union
└── Property might be unset   -> Optional field

Need to validate runtime data?
├── User input / API requests -> Zod schema + safeParse
├── External JSON             -> safeParseJSON + guard
└── Env variables             -> Zod schema at startup

Async operation?
├── Single value              -> async/await
├── Multiple independent      -> Promise.all / allSettled
├── Streaming                 -> AsyncGenerator
└── Needs cancellation        -> AbortController
```

## 13. Verification Checklist

Before considering work complete:

- [ ] `tsc --noEmit` passes with zero errors
- [ ] No new `any` introduced
- [ ] All external data validated
- [ ] Public functions have explicit return types
- [ ] All promises awaited or explicitly handled
- [ ] Discriminated unions have exhaustiveness checks
- [ ] Tests cover happy path and error variants
- [ ] Lint and formatter pass
- [ ] No secrets logged
- [ ] No unnecessary dependencies added
- [ ] Diff is focused on the requested task

## 14. Agent Behavior

When acting as a coding agent:

- Inspect before changing. Read related files and configs first.
- State assumptions briefly when meaningful.
- Prefer minimal, high-confidence edits. No unrequested refactors.
- Ask for clarification when the wrong choice would be costly.
- Use the detected package manager. Do not assume npm.
- Do not invent commands. Check `package.json` scripts.
- If you cannot run tests, say so and provide the exact commands.
- Never claim tests, builds, or typechecks passed unless you actually ran them.
- Summarize changes after editing.
- Mention risks, tradeoffs, or follow-up work.

## 15. Final Response Format

When reporting completion, include:

```markdown
What changed:
- <bullet list of changes>

Why:
- <brief rationale>

Checks run:
- <commands actually executed and their results>

Not run / unable to verify:
- <anything skipped>

Follow-ups:
- <recommendations>
```

## 16. Toolchain Reference

| Purpose | Tool |
| --- | --- |
| Runtime validation | zod, valibot, arktype |
| Testing | vitest, jest, node:test |
| Linting | eslint + typescript-eslint |
| Formatting | prettier |
| Type testing | tsd, expect-type |
| Circular import detection | `madge --circular src/` |
| Build | tsc, tsup, esbuild |
| Monorepo | turborepo + pnpm workspaces |
