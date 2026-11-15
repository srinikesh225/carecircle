import { defineConfig } from 'vitest/config'

// Firestore security-rule tests. They need the emulator, so they are separate from `npm test`:
// `npm run test:rules` starts the emulator through the Firebase CLI and runs only these files.
export default defineConfig({
  test: { include: ['tests/**/*.emulator.ts'], environment: 'node', testTimeout: 20_000, hookTimeout: 60_000 },
})
