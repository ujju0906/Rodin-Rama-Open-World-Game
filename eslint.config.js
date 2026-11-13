import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'screenshots', 'src/assets/figureData.ts', 'src/assets/ramaMesh.ts', 'src/assets/tatakaMesh.ts', 'src/assets/rakshasaMesh.ts', 'src/assets/deerMesh.ts', 'src/assets/vimanaMesh.ts', 'scripts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
