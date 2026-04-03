# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0-beta.1](https://github.com/awaitstep/awaitstep.dev/compare/v1.0.1-beta.1...v1.1.0-beta.1) (2026-04-02)

### Features

- **account:** conditionally render connected accounts based on enabled OAuth providers ([9124d8e](https://github.com/awaitstep/awaitstep.dev/commit/9124d8ea829200cdba2acfc9d93261715672e87b))
- add 28 new registry nodes + audit fixes across all 44 nodes ([890dbc1](https://github.com/awaitstep/awaitstep.dev/commit/890dbc1bc066761b4f170e495b1c33e6e4025473))
- add logo and update email branding ([ccfe0cc](https://github.com/awaitstep/awaitstep.dev/commit/ccfe0ccc12248b46f240b6bde3dcaf0a59eac721))
- add mailgun_send_email node to registry ([#59](https://github.com/awaitstep/awaitstep.dev/issues/59)) ([6994ff8](https://github.com/awaitstep/awaitstep.dev/commit/6994ff82bb5af6429919c679ee87350fe454ad3e))
- add request logger, fix session rate limiting, and 404 page ([a136c7d](https://github.com/awaitstep/awaitstep.dev/commit/a136c7dacb012662ad159c3448e9157429ad91d9))
- API key management UI and database migration ([f012f63](https://github.com/awaitstep/awaitstep.dev/commit/f012f63d264c82776bd1aaa21e57be5a663f4610))
- API playground and endpoint documentation ([d30b531](https://github.com/awaitstep/awaitstep.dev/commit/d30b531f582f961f207bd9f782e38b5363d4bf1f))
- **api:** API security hardening and structured logging ([f5d07a1](https://github.com/awaitstep/awaitstep.dev/commit/f5d07a144e1aa0e004a9cf8aabad6735f1e0b3f3))
- **auth:** enable user deletion and conditional magic link plugin ([4db04ca](https://github.com/awaitstep/awaitstep.dev/commit/4db04cab27ca2375eab66e87699e0d328e077efc))
- build-time node registry with API endpoints ([0f7c75e](https://github.com/awaitstep/awaitstep.dev/commit/0f7c75e5a392a2245e94de34c0a446089c009c19))
- custom node improvements (deps, codegen, defaults, icons) ([4d820e2](https://github.com/awaitstep/awaitstep.dev/commit/4d820e230385702eedb83f1a7f641093a73fbbdc))
- custom node template compilation for codegen ([3a5e4a2](https://github.com/awaitstep/awaitstep.dev/commit/3a5e4a230ab1fa1f11b936d23736ae2211ed9aea))
- custom nodes IR foundation and dispatch hardening ([7e3bf88](https://github.com/awaitstep/awaitstep.dev/commit/7e3bf88aaac11e851cf13d537a067cfe6c353645))
- custom nodes Phase 2 — registry-driven palette and schema-driven config ([07351b9](https://github.com/awaitstep/awaitstep.dev/commit/07351b991a4c6beda51e5484d03caa743afacc3c))
- debounce config panel input onChange handlers ([ac1193a](https://github.com/awaitstep/awaitstep.dev/commit/ac1193a4c764cbe9228aeee4d220413b4eae6a81))
- editable trigger code in workflow settings ([af65a3c](https://github.com/awaitstep/awaitstep.dev/commit/af65a3c86dd12a7aa7381c781aa61515fd5d830b))
- environment variable management + missing node detection ([0d23ea9](https://github.com/awaitstep/awaitstep.dev/commit/0d23ea9fbecffeedaff9357c71efdd223652928e))
- frontend org/project context, switcher, and setup ([1329997](https://github.com/awaitstep/awaitstep.dev/commit/1329997d3d5647da75e1f291ae070df4b9c55315))
- local workflow testing with wrangler dev ([23d6c74](https://github.com/awaitstep/awaitstep.dev/commit/23d6c7421709bd00c49ad3857dd341c3bb293855))
- node-author agent, /create-node skill, and authoring guide ([bde988b](https://github.com/awaitstep/awaitstep.dev/commit/bde988b06fa0d943ebdcdfdb54a2953618a6ba62))
- node-cli with generate command and example node ([c451dc1](https://github.com/awaitstep/awaitstep.dev/commit/c451dc1b85ec7077bf22feac6e3f20cd5ba617be))
- npm dependency support for workflows ([a532679](https://github.com/awaitstep/awaitstep.dev/commit/a5326795bf216b7fedba51bbe29303b8b0e5e845))
- organizations and projects ownership model ([a00b23b](https://github.com/awaitstep/awaitstep.dev/commit/a00b23b2fe2ab0d9844065719adec87fa1e90312))
- persist workflow env vars to DB and load on open ([3e043be](https://github.com/awaitstep/awaitstep.dev/commit/3e043be7661516bc40aa7309f16aab561dace990))
- Phase 1 audit gap implementations ([afefb20](https://github.com/awaitstep/awaitstep.dev/commit/afefb20811a7eb9d6eb6e04ac8f5936b1ec721a4))
- preview mode for codegen hides node class implementations ([a5fa0e8](https://github.com/awaitstep/awaitstep.dev/commit/a5fa0e89ce6cb44a5cc5d089b3f027d053542f50))
- preview mode for codegen hides node class implementations ([09388ae](https://github.com/awaitstep/awaitstep.dev/commit/09388ae0a84d36c584895dd210f82675752fee92))
- preview mode for codegen hides node class implementations ([8eb883f](https://github.com/awaitstep/awaitstep.dev/commit/8eb883f4d68ae2e19a0f4f9af81176f3334d4876))
- preview mode for codegen hides node class implementations ([3a89b7a](https://github.com/awaitstep/awaitstep.dev/commit/3a89b7a9f3c9bb419af29b43fed35c293cb16d0b))
- preview mode for codegen hides node class implementations ([890dbc1](https://github.com/awaitstep/awaitstep.dev/commit/890dbc1bc066761b4f170e495b1c33e6e4025473))
- redesign homepage with handwritten hero and feature grid ([c4623ca](https://github.com/awaitstep/awaitstep.dev/commit/c4623ca1a9ece74573fb94d0d8dd941caff449be))
- remote node registry with marketplace ([0c7e438](https://github.com/awaitstep/awaitstep.dev/commit/0c7e4384afa9c408c4d5cdc19a5df627bf93e4d2))
- settings, security, onboarding, and code quality improvements ([58e255b](https://github.com/awaitstep/awaitstep.dev/commit/58e255bb0ee177b8a4325dce3353342527b79254))
- smart install script with auto Caddy setup ([e24fe19](https://github.com/awaitstep/awaitstep.dev/commit/e24fe19f69caa9d6048a01b2e4efcb7d47d358cf))
- visual canvas and deployment v0.0.1 ([4bb54fb](https://github.com/awaitstep/awaitstep.dev/commit/4bb54fb16861fb4cd67a7880abcb84ac5b85b06b))
- **web:** add new logo and update branding colors ([947ff1c](https://github.com/awaitstep/awaitstep.dev/commit/947ff1cc5ad323a0b7f77b91fb6a45eff5bc37c2))
- **web:** breadcrumb navigation and card list redesign ([2028f70](https://github.com/awaitstep/awaitstep.dev/commit/2028f70b58fab1b8d9e1f3ea45738cd6c0fb156d))
- **web:** move trigger code editor to its own overlay dialog ([e5c1e6f](https://github.com/awaitstep/awaitstep.dev/commit/e5c1e6fb807eac6b4dac30af6ad670d4e34dd21c))
- workflow versioning suite ([69b0582](https://github.com/awaitstep/awaitstep.dev/commit/69b0582d2853fcfa30bd3947800b071c5aedb47a))

### Bug Fixes

- add packages:write permission to release workflow ([f1e1477](https://github.com/awaitstep/awaitstep.dev/commit/f1e1477cde10c4eaf692c0d6f0d9e312875577dd))
- API security hardening and dependency patches ([494ce27](https://github.com/awaitstep/awaitstep.dev/commit/494ce2761ff7609ac9428bb0fd6c88dcbc5554ed))
- **api:** sanitize workflow name in CF API calls for run operations ([18e3ee7](https://github.com/awaitstep/awaitstep.dev/commit/18e3ee7afb6395ecd71e4007f1093071c85fc027))
- checksum mismatch in registry client ([#56](https://github.com/awaitstep/awaitstep.dev/issues/56)) ([005d69d](https://github.com/awaitstep/awaitstep.dev/commit/005d69d6165b79bf43d54bc75037e43647fe3307))
- CI workflow formatting and bug fixes ([#58](https://github.com/awaitstep/awaitstep.dev/issues/58)) ([e213d54](https://github.com/awaitstep/awaitstep.dev/commit/e213d547f3a0e2a848b52848d85c14f820467ca7))
- **cloudflare:** bind wrangler dev to 0.0.0.0 and remove global install ([0c49490](https://github.com/awaitstep/awaitstep.dev/commit/0c49490788002f1fc961a6f12623f206e8c2e369))
- **codegen:** rewrite env. to this.env. inside workflow run() body ([9a01371](https://github.com/awaitstep/awaitstep.dev/commit/9a013713855c28af7c4d3fa24e0aeaecc27dcdc2))
- commit registry index.json and upgrade CI to Node 22 ([699cfa4](https://github.com/awaitstep/awaitstep.dev/commit/699cfa451864486e89bec394d76d43f0ec1d77fd))
- **deploy:** use wrangler secret put for secrets instead of .env file ([19bf1f0](https://github.com/awaitstep/awaitstep.dev/commit/19bf1f057554766362b0911212d3a46e3f5606ce))
- **deploy:** write .env file for wrangler and separate secrets from vars ([4b8f374](https://github.com/awaitstep/awaitstep.dev/commit/4b8f374c83687bd7ae5424c5cda847956bb01e5c))
- dismissable org/project dialogs with centralized guards ([0b0d0a9](https://github.com/awaitstep/awaitstep.dev/commit/0b0d0a902801de8c5fc3bb1bdf335158edabffda))
- enable local dev routes in all environments ([bd3ff52](https://github.com/awaitstep/awaitstep.dev/commit/bd3ff5269aab814f99f01c2cee4468638bb22823))
- enable local dev routes in all environments ([eccc273](https://github.com/awaitstep/awaitstep.dev/commit/eccc2738554be20fba159646d8ec7989cedee39a))
- improve install.sh with interactive prompts for all config ([769d9f2](https://github.com/awaitstep/awaitstep.dev/commit/769d9f25ff4fe02fd61de67b53a802c227e78169))
- install wrangler in Docker image for local dev support ([6b0b43f](https://github.com/awaitstep/awaitstep.dev/commit/6b0b43f02ce5618bd61417e472adc226c15d4444))
- install wrangler in Docker image for local dev support ([5d3250e](https://github.com/awaitstep/awaitstep.dev/commit/5d3250ed6e66453c59efb1942a39a14cab189aee))
- local dev cleanup, ENABLE_LOCAL_DEV gate, clipboard fallback ([e40d31d](https://github.com/awaitstep/awaitstep.dev/commit/e40d31dce17862eac39fa123c2d66d9bb02ae116))
- **org-dialog:** set active organization after creation for new users ([7d2dd82](https://github.com/awaitstep/awaitstep.dev/commit/7d2dd822c35f0d27dc1a22180ff280fd8b3001b9))
- qualify outer table column in correlated subqueries ([d837554](https://github.com/awaitstep/awaitstep.dev/commit/d8375542506bbb35d328869e4f70fe46a214e2ca))
- resolve Dependabot security alerts for picomatch, srvx, undici ([6e871ef](https://github.com/awaitstep/awaitstep.dev/commit/6e871effff7426ac414b24065b4bf4dd4e0ef164))
- resolve merge conflicts from main, restore dev versions ([33b1b8c](https://github.com/awaitstep/awaitstep.dev/commit/33b1b8cb16ed287d77fb67db6efe4eb5459ba63f))
- security cleanup and persist trigger code to DB ([59700f7](https://github.com/awaitstep/awaitstep.dev/commit/59700f70a0aaefc621cc912d8771d8abce2d1eca))
- silence zustand persist SSR warnings with createJSONStorage ([b56efa8](https://github.com/awaitstep/awaitstep.dev/commit/b56efa83a47cca136d652148a448065eb101d4e6))
- SSR server config falls back to PORT env for Docker ([95ac6bb](https://github.com/awaitstep/awaitstep.dev/commit/95ac6bb9b4c23cb500847a48fafd36b8918c634a))
- switch Docker base to node:22-slim for workerd compatibility ([95ecbf2](https://github.com/awaitstep/awaitstep.dev/commit/95ecbf276c51bce80b8c09fd8d9d4512ff2475d8))
- uninstall UI bug, brand icons, remove local resend node ([#57](https://github.com/awaitstep/awaitstep.dev/issues/57)) ([5529186](https://github.com/awaitstep/awaitstep.dev/commit/55291868b4c08640304615fe34ddb6fa9f3cff08))
- use loader instead of beforeLoad for local dev flag ([09bd3a1](https://github.com/awaitstep/awaitstep.dev/commit/09bd3a1524395fe587a3a374120e9513124dbd7f))
- use relative URLs for auth client in Docker builds ([3e71140](https://github.com/awaitstep/awaitstep.dev/commit/3e7114032f4128ccb523dd435f394c6d168e2120))
- use valid category values in node definitions ([#62](https://github.com/awaitstep/awaitstep.dev/issues/62)) ([5a5f1b0](https://github.com/awaitstep/awaitstep.dev/commit/5a5f1b08219dfc5926e32382fd361d2de5442ab7))
- **web:** add back navigation arrow to workflow detail layout ([c8dd84e](https://github.com/awaitstep/awaitstep.dev/commit/c8dd84eff56697a1f185491385334539f48107c0))
- **web:** add label editing for branch conditions ([357698a](https://github.com/awaitstep/awaitstep.dev/commit/357698a2f112cdc82bef8da4028241038e0e308e))
- **web:** defer CodeEditor mount in settings to prevent flash ([725249a](https://github.com/awaitstep/awaitstep.dev/commit/725249a82f0a988d7ec0d0769aa0e2ca3de5b3f3))
- **web:** eagerly import WorkflowSettings to eliminate toggle flash ([1371c00](https://github.com/awaitstep/awaitstep.dev/commit/1371c00f6c0170c4c9c0e6df757b3a3f17e409d2))
- **web:** isolate trigger code editor into lazy-loaded component ([08a8b86](https://github.com/awaitstep/awaitstep.dev/commit/08a8b8673f0c2367aa8fbba716dec5d21d7d25b6))
- **web:** lazy-load code editor in workflow settings to prevent flash ([83dada2](https://github.com/awaitstep/awaitstep.dev/commit/83dada254f8d8be7af97c9dace2f71d7b3719b7f))
- **web:** lazy-load WorkflowSettings to prevent flash on toggle ([6d67b92](https://github.com/awaitstep/awaitstep.dev/commit/6d67b9286f884a8a89f813cec5729baac97ce266))
- **web:** make Workflows breadcrumb clickable and show workflow ID ([d948d14](https://github.com/awaitstep/awaitstep.dev/commit/d948d140f34af941a895ff2697d3f79b1506d655))
- **web:** move back link to content area matching run detail style ([0653321](https://github.com/awaitstep/awaitstep.dev/commit/065332191784e34c1d026aff22653c8ebb052f38))
- **web:** point Workflows breadcrumb to /workflows ([eb2d035](https://github.com/awaitstep/awaitstep.dev/commit/eb2d03546eac7492c52b43047f681622178b83f7))
- **web:** replace CodeEditor with textarea for trigger code ([815f4d1](https://github.com/awaitstep/awaitstep.dev/commit/815f4d14ee17113f06fcb2480554c8eeba55a1e3))
- **web:** reset only non-canvas state when switching workflows ([b138582](https://github.com/awaitstep/awaitstep.dev/commit/b13858240e532f6ec27047af666b52b095f1d4d4))
- **web:** reset workflow state when switching between workflows ([d55ee6e](https://github.com/awaitstep/awaitstep.dev/commit/d55ee6e29d3ca95df209b8b98007e17ce22ff2d6))
- **web:** use breadcrumb nav for workflow detail pages ([b108100](https://github.com/awaitstep/awaitstep.dev/commit/b1081005d69a84404134c3b620ff25a373d99d40))
- **web:** use breadcrumb nav on run detail page ([b917239](https://github.com/awaitstep/awaitstep.dev/commit/b9172392deb3b9e7e701a3a35b2f0e2db1a13c75))
- **web:** use CSS truncate for workflow ID breadcrumb ([6325ebf](https://github.com/awaitstep/awaitstep.dev/commit/6325ebf63926917d80c0a65a789d36c6b83ad634))
- **web:** use eager CodeEditor import in workflow settings ([74297cd](https://github.com/awaitstep/awaitstep.dev/commit/74297cd72ddc9ff6dc579e77ee019566b5755158))
- **web:** use router.history.back() and place back link above tabs ([857b2c1](https://github.com/awaitstep/awaitstep.dev/commit/857b2c1da13a36d41026649a386601ef0a36b4f8))

### Refactoring

- class-based codegen for custom nodes + docs ([#70](https://github.com/awaitstep/awaitstep.dev/issues/70)) ([994cbbc](https://github.com/awaitstep/awaitstep.dev/commit/994cbbc543207ead5b4738acb30f82dea790bf16))
- data flow architecture, dashboard split, and cleanup ([4daa79c](https://github.com/awaitstep/awaitstep.dev/commit/4daa79c8186086e1d134615744fbfbbd24a5cc40))
- decompose page components into sub-components ([3c5c364](https://github.com/awaitstep/awaitstep.dev/commit/3c5c36488ca45fbab5521622534260c7deaa0272))
- drop generatedCode from workflow_versions ([c83d819](https://github.com/awaitstep/awaitstep.dev/commit/c83d8198a2fe629cff118e2b0691841b8c9b519a))
- extract canvas route logic into hooks and utils ([fdcfb47](https://github.com/awaitstep/awaitstep.dev/commit/fdcfb47ad726a6d60772ec6896c514edee75e766))
- extract deploy dialog into hook, util, and sub-views ([9832375](https://github.com/awaitstep/awaitstep.dev/commit/9832375b9daf3f4aae18aa529998db31a4361e18))
- extract static wrangler base config from dynamic generation ([2a8a4ef](https://github.com/awaitstep/awaitstep.dev/commit/2a8a4ef7176e6e4d475edf0ac9a1ddd863aa4e29))
- extract workflow hydration and derivation functions ([f75735a](https://github.com/awaitstep/awaitstep.dev/commit/f75735ab8abe4513faec3bba531996d71fdfbcc8))
- extract workflow save/deploy logic into hook ([06fffa8](https://github.com/awaitstep/awaitstep.dev/commit/06fffa8543516ae1eef18d561fb09549cf6e18bb))
- make worker package name configurable via APP_NAME env var ([cb6ca5b](https://github.com/awaitstep/awaitstep.dev/commit/cb6ca5be1646d76fcdecfc2c58b160f281b280ce))
- migrate useBlocker to non-deprecated API ([5365d05](https://github.com/awaitstep/awaitstep.dev/commit/5365d05ef60789a14684a93c241e2ecc7b9cf4e0))
- remove self-hosted Cloudflare connection flow ([6c0bb86](https://github.com/awaitstep/awaitstep.dev/commit/6c0bb86ca1c026fc0a3117a64bdc06a41290db15))
- service-level nodes, tests, and production fixes ([#61](https://github.com/awaitstep/awaitstep.dev/issues/61)) ([ac18481](https://github.com/awaitstep/awaitstep.dev/commit/ac18481161c49ac864f412992652421714ed6106))
- slim down canvas route to thin orchestrator ([993a283](https://github.com/awaitstep/awaitstep.dev/commit/993a2830d9cf9757667ccf0c120fa6ec2278349d))
- split canvas route into sub-components ([ad5bf4c](https://github.com/awaitstep/awaitstep.dev/commit/ad5bf4cf780d8c4ad1c3be47e57be14e13d3167b))
- standardize Zustand store access patterns ([8006f46](https://github.com/awaitstep/awaitstep.dev/commit/8006f467b0e611ecf37e8429be7f46b8f607d46b))
- stateless local dev with shared workflow preparation ([a762713](https://github.com/awaitstep/awaitstep.dev/commit/a7627136afb89c595bafb026de3eb061d9a066e3))
- unified node model — all nodes follow NodeDefinition spec ([41bcd17](https://github.com/awaitstep/awaitstep.dev/commit/41bcd179bc435182508837bfe6f77b3f831b98fe))
- use npx wrangler instead of resolving wrangler binary ([2fa554d](https://github.com/awaitstep/awaitstep.dev/commit/2fa554d98df8cdb466ddd3ed640583a43a270215))
- **web:** move Entry button from toolbar to code preview header ([7dc7a3e](https://github.com/awaitstep/awaitstep.dev/commit/7dc7a3eb746a1f1375f9842bfb9de8bbdad5ab6c))
- **web:** simplify local dev hook and remove unused UI elements ([100cd38](https://github.com/awaitstep/awaitstep.dev/commit/100cd381be8941640f3bca4c91f0a8c7ec3e1d43))

### Performance

- replace vite-tsconfig-paths plugin with native resolve.tsconfigPaths ([1a0bec5](https://github.com/awaitstep/awaitstep.dev/commit/1a0bec5490dc566cab4621c0eae0d4d97b2c0341))
- replace vite-tsconfig-paths with native Vite 8 resolution ([06b3d11](https://github.com/awaitstep/awaitstep.dev/commit/06b3d117c3e1024749ff5dd9db05f78bdf7ab9fc))

### Documentation

- add Claude Code project rules ([99ee603](https://github.com/awaitstep/awaitstep.dev/commit/99ee603c0a12eaa89e7dcf4d0f82659e0dd97729))
- add phase 1 implementation plan ([2603c97](https://github.com/awaitstep/awaitstep.dev/commit/2603c97bedf4456fce251855cf96f87ae0643b39))
- update architecture, add custom nodes and compilation docs ([ecaf180](https://github.com/awaitstep/awaitstep.dev/commit/ecaf18023695617ba2f4fb83053783c558dc25b8))
- update architecture, READMEs, and changelog for recent features ([8e6def7](https://github.com/awaitstep/awaitstep.dev/commit/8e6def76e53dadb251f47ba12c9358e069c18531))

## [1.0.1-beta.1](https://github.com/awaitstep/awaitstep.dev/compare/v1.0.0-beta.1...v1.0.1-beta.1) (2026-04-01)

### Features

- **account:** conditionally render connected accounts based on enabled OAuth providers ([9124d8e](https://github.com/awaitstep/awaitstep.dev/commit/9124d8ea829200cdba2acfc9d93261715672e87b))
- add 28 new registry nodes + audit fixes across all 44 nodes ([890dbc1](https://github.com/awaitstep/awaitstep.dev/commit/890dbc1bc066761b4f170e495b1c33e6e4025473))
- add mailgun_send_email node to registry ([#59](https://github.com/awaitstep/awaitstep.dev/issues/59)) ([6994ff8](https://github.com/awaitstep/awaitstep.dev/commit/6994ff82bb5af6429919c679ee87350fe454ad3e))
- add request logger, fix session rate limiting, and 404 page ([a136c7d](https://github.com/awaitstep/awaitstep.dev/commit/a136c7dacb012662ad159c3448e9157429ad91d9))
- API key management UI and database migration ([f012f63](https://github.com/awaitstep/awaitstep.dev/commit/f012f63d264c82776bd1aaa21e57be5a663f4610))
- API playground and endpoint documentation ([d30b531](https://github.com/awaitstep/awaitstep.dev/commit/d30b531f582f961f207bd9f782e38b5363d4bf1f))
- **api:** API security hardening and structured logging ([f5d07a1](https://github.com/awaitstep/awaitstep.dev/commit/f5d07a144e1aa0e004a9cf8aabad6735f1e0b3f3))
- **auth:** enable user deletion and conditional magic link plugin ([4db04ca](https://github.com/awaitstep/awaitstep.dev/commit/4db04cab27ca2375eab66e87699e0d328e077efc))
- build-time node registry with API endpoints ([0f7c75e](https://github.com/awaitstep/awaitstep.dev/commit/0f7c75e5a392a2245e94de34c0a446089c009c19))
- custom node improvements (deps, codegen, defaults, icons) ([4d820e2](https://github.com/awaitstep/awaitstep.dev/commit/4d820e230385702eedb83f1a7f641093a73fbbdc))
- custom node template compilation for codegen ([3a5e4a2](https://github.com/awaitstep/awaitstep.dev/commit/3a5e4a230ab1fa1f11b936d23736ae2211ed9aea))
- custom nodes IR foundation and dispatch hardening ([7e3bf88](https://github.com/awaitstep/awaitstep.dev/commit/7e3bf88aaac11e851cf13d537a067cfe6c353645))
- custom nodes Phase 2 — registry-driven palette and schema-driven config ([07351b9](https://github.com/awaitstep/awaitstep.dev/commit/07351b991a4c6beda51e5484d03caa743afacc3c))
- debounce config panel input onChange handlers ([ac1193a](https://github.com/awaitstep/awaitstep.dev/commit/ac1193a4c764cbe9228aeee4d220413b4eae6a81))
- editable trigger code in workflow settings ([af65a3c](https://github.com/awaitstep/awaitstep.dev/commit/af65a3c86dd12a7aa7381c781aa61515fd5d830b))
- environment variable management + missing node detection ([0d23ea9](https://github.com/awaitstep/awaitstep.dev/commit/0d23ea9fbecffeedaff9357c71efdd223652928e))
- frontend org/project context, switcher, and setup ([1329997](https://github.com/awaitstep/awaitstep.dev/commit/1329997d3d5647da75e1f291ae070df4b9c55315))
- local workflow testing with wrangler dev ([23d6c74](https://github.com/awaitstep/awaitstep.dev/commit/23d6c7421709bd00c49ad3857dd341c3bb293855))
- node-author agent, /create-node skill, and authoring guide ([bde988b](https://github.com/awaitstep/awaitstep.dev/commit/bde988b06fa0d943ebdcdfdb54a2953618a6ba62))
- node-cli with generate command and example node ([c451dc1](https://github.com/awaitstep/awaitstep.dev/commit/c451dc1b85ec7077bf22feac6e3f20cd5ba617be))
- npm dependency support for workflows ([a532679](https://github.com/awaitstep/awaitstep.dev/commit/a5326795bf216b7fedba51bbe29303b8b0e5e845))
- organizations and projects ownership model ([a00b23b](https://github.com/awaitstep/awaitstep.dev/commit/a00b23b2fe2ab0d9844065719adec87fa1e90312))
- persist workflow env vars to DB and load on open ([3e043be](https://github.com/awaitstep/awaitstep.dev/commit/3e043be7661516bc40aa7309f16aab561dace990))
- Phase 1 audit gap implementations ([afefb20](https://github.com/awaitstep/awaitstep.dev/commit/afefb20811a7eb9d6eb6e04ac8f5936b1ec721a4))
- preview mode for codegen hides node class implementations ([a5fa0e8](https://github.com/awaitstep/awaitstep.dev/commit/a5fa0e89ce6cb44a5cc5d089b3f027d053542f50))
- preview mode for codegen hides node class implementations ([09388ae](https://github.com/awaitstep/awaitstep.dev/commit/09388ae0a84d36c584895dd210f82675752fee92))
- preview mode for codegen hides node class implementations ([8eb883f](https://github.com/awaitstep/awaitstep.dev/commit/8eb883f4d68ae2e19a0f4f9af81176f3334d4876))
- preview mode for codegen hides node class implementations ([3a89b7a](https://github.com/awaitstep/awaitstep.dev/commit/3a89b7a9f3c9bb419af29b43fed35c293cb16d0b))
- preview mode for codegen hides node class implementations ([890dbc1](https://github.com/awaitstep/awaitstep.dev/commit/890dbc1bc066761b4f170e495b1c33e6e4025473))
- redesign homepage with handwritten hero and feature grid ([c4623ca](https://github.com/awaitstep/awaitstep.dev/commit/c4623ca1a9ece74573fb94d0d8dd941caff449be))
- remote node registry with marketplace ([0c7e438](https://github.com/awaitstep/awaitstep.dev/commit/0c7e4384afa9c408c4d5cdc19a5df627bf93e4d2))
- settings, security, onboarding, and code quality improvements ([58e255b](https://github.com/awaitstep/awaitstep.dev/commit/58e255bb0ee177b8a4325dce3353342527b79254))
- smart install script with auto Caddy setup ([e24fe19](https://github.com/awaitstep/awaitstep.dev/commit/e24fe19f69caa9d6048a01b2e4efcb7d47d358cf))
- visual canvas and deployment v0.0.1 ([4bb54fb](https://github.com/awaitstep/awaitstep.dev/commit/4bb54fb16861fb4cd67a7880abcb84ac5b85b06b))
- **web:** breadcrumb navigation and card list redesign ([2028f70](https://github.com/awaitstep/awaitstep.dev/commit/2028f70b58fab1b8d9e1f3ea45738cd6c0fb156d))
- **web:** move trigger code editor to its own overlay dialog ([e5c1e6f](https://github.com/awaitstep/awaitstep.dev/commit/e5c1e6fb807eac6b4dac30af6ad670d4e34dd21c))
- workflow versioning suite ([69b0582](https://github.com/awaitstep/awaitstep.dev/commit/69b0582d2853fcfa30bd3947800b071c5aedb47a))

### Bug Fixes

- add packages:write permission to release workflow ([f1e1477](https://github.com/awaitstep/awaitstep.dev/commit/f1e1477cde10c4eaf692c0d6f0d9e312875577dd))
- API security hardening and dependency patches ([494ce27](https://github.com/awaitstep/awaitstep.dev/commit/494ce2761ff7609ac9428bb0fd6c88dcbc5554ed))
- **api:** sanitize workflow name in CF API calls for run operations ([18e3ee7](https://github.com/awaitstep/awaitstep.dev/commit/18e3ee7afb6395ecd71e4007f1093071c85fc027))
- checksum mismatch in registry client ([#56](https://github.com/awaitstep/awaitstep.dev/issues/56)) ([005d69d](https://github.com/awaitstep/awaitstep.dev/commit/005d69d6165b79bf43d54bc75037e43647fe3307))
- CI workflow formatting and bug fixes ([#58](https://github.com/awaitstep/awaitstep.dev/issues/58)) ([e213d54](https://github.com/awaitstep/awaitstep.dev/commit/e213d547f3a0e2a848b52848d85c14f820467ca7))
- **cloudflare:** bind wrangler dev to 0.0.0.0 and remove global install ([0c49490](https://github.com/awaitstep/awaitstep.dev/commit/0c49490788002f1fc961a6f12623f206e8c2e369))
- **codegen:** rewrite env. to this.env. inside workflow run() body ([9a01371](https://github.com/awaitstep/awaitstep.dev/commit/9a013713855c28af7c4d3fa24e0aeaecc27dcdc2))
- commit registry index.json and upgrade CI to Node 22 ([699cfa4](https://github.com/awaitstep/awaitstep.dev/commit/699cfa451864486e89bec394d76d43f0ec1d77fd))
- **deploy:** use wrangler secret put for secrets instead of .env file ([19bf1f0](https://github.com/awaitstep/awaitstep.dev/commit/19bf1f057554766362b0911212d3a46e3f5606ce))
- **deploy:** write .env file for wrangler and separate secrets from vars ([4b8f374](https://github.com/awaitstep/awaitstep.dev/commit/4b8f374c83687bd7ae5424c5cda847956bb01e5c))
- dismissable org/project dialogs with centralized guards ([0b0d0a9](https://github.com/awaitstep/awaitstep.dev/commit/0b0d0a902801de8c5fc3bb1bdf335158edabffda))
- enable local dev routes in all environments ([bd3ff52](https://github.com/awaitstep/awaitstep.dev/commit/bd3ff5269aab814f99f01c2cee4468638bb22823))
- enable local dev routes in all environments ([eccc273](https://github.com/awaitstep/awaitstep.dev/commit/eccc2738554be20fba159646d8ec7989cedee39a))
- improve install.sh with interactive prompts for all config ([769d9f2](https://github.com/awaitstep/awaitstep.dev/commit/769d9f25ff4fe02fd61de67b53a802c227e78169))
- install wrangler in Docker image for local dev support ([6b0b43f](https://github.com/awaitstep/awaitstep.dev/commit/6b0b43f02ce5618bd61417e472adc226c15d4444))
- install wrangler in Docker image for local dev support ([5d3250e](https://github.com/awaitstep/awaitstep.dev/commit/5d3250ed6e66453c59efb1942a39a14cab189aee))
- local dev cleanup, ENABLE_LOCAL_DEV gate, clipboard fallback ([e40d31d](https://github.com/awaitstep/awaitstep.dev/commit/e40d31dce17862eac39fa123c2d66d9bb02ae116))
- **org-dialog:** set active organization after creation for new users ([7d2dd82](https://github.com/awaitstep/awaitstep.dev/commit/7d2dd822c35f0d27dc1a22180ff280fd8b3001b9))
- qualify outer table column in correlated subqueries ([d837554](https://github.com/awaitstep/awaitstep.dev/commit/d8375542506bbb35d328869e4f70fe46a214e2ca))
- resolve Dependabot security alerts for picomatch, srvx, undici ([6e871ef](https://github.com/awaitstep/awaitstep.dev/commit/6e871effff7426ac414b24065b4bf4dd4e0ef164))
- resolve merge conflicts from main, restore dev versions ([33b1b8c](https://github.com/awaitstep/awaitstep.dev/commit/33b1b8cb16ed287d77fb67db6efe4eb5459ba63f))
- security cleanup and persist trigger code to DB ([59700f7](https://github.com/awaitstep/awaitstep.dev/commit/59700f70a0aaefc621cc912d8771d8abce2d1eca))
- silence zustand persist SSR warnings with createJSONStorage ([b56efa8](https://github.com/awaitstep/awaitstep.dev/commit/b56efa83a47cca136d652148a448065eb101d4e6))
- SSR server config falls back to PORT env for Docker ([95ac6bb](https://github.com/awaitstep/awaitstep.dev/commit/95ac6bb9b4c23cb500847a48fafd36b8918c634a))
- switch Docker base to node:22-slim for workerd compatibility ([95ecbf2](https://github.com/awaitstep/awaitstep.dev/commit/95ecbf276c51bce80b8c09fd8d9d4512ff2475d8))
- uninstall UI bug, brand icons, remove local resend node ([#57](https://github.com/awaitstep/awaitstep.dev/issues/57)) ([5529186](https://github.com/awaitstep/awaitstep.dev/commit/55291868b4c08640304615fe34ddb6fa9f3cff08))
- use loader instead of beforeLoad for local dev flag ([09bd3a1](https://github.com/awaitstep/awaitstep.dev/commit/09bd3a1524395fe587a3a374120e9513124dbd7f))
- use relative URLs for auth client in Docker builds ([3e71140](https://github.com/awaitstep/awaitstep.dev/commit/3e7114032f4128ccb523dd435f394c6d168e2120))
- use valid category values in node definitions ([#62](https://github.com/awaitstep/awaitstep.dev/issues/62)) ([5a5f1b0](https://github.com/awaitstep/awaitstep.dev/commit/5a5f1b08219dfc5926e32382fd361d2de5442ab7))
- **web:** add back navigation arrow to workflow detail layout ([c8dd84e](https://github.com/awaitstep/awaitstep.dev/commit/c8dd84eff56697a1f185491385334539f48107c0))
- **web:** add label editing for branch conditions ([357698a](https://github.com/awaitstep/awaitstep.dev/commit/357698a2f112cdc82bef8da4028241038e0e308e))
- **web:** defer CodeEditor mount in settings to prevent flash ([725249a](https://github.com/awaitstep/awaitstep.dev/commit/725249a82f0a988d7ec0d0769aa0e2ca3de5b3f3))
- **web:** eagerly import WorkflowSettings to eliminate toggle flash ([1371c00](https://github.com/awaitstep/awaitstep.dev/commit/1371c00f6c0170c4c9c0e6df757b3a3f17e409d2))
- **web:** isolate trigger code editor into lazy-loaded component ([08a8b86](https://github.com/awaitstep/awaitstep.dev/commit/08a8b8673f0c2367aa8fbba716dec5d21d7d25b6))
- **web:** lazy-load code editor in workflow settings to prevent flash ([83dada2](https://github.com/awaitstep/awaitstep.dev/commit/83dada254f8d8be7af97c9dace2f71d7b3719b7f))
- **web:** lazy-load WorkflowSettings to prevent flash on toggle ([6d67b92](https://github.com/awaitstep/awaitstep.dev/commit/6d67b9286f884a8a89f813cec5729baac97ce266))
- **web:** make Workflows breadcrumb clickable and show workflow ID ([d948d14](https://github.com/awaitstep/awaitstep.dev/commit/d948d140f34af941a895ff2697d3f79b1506d655))
- **web:** move back link to content area matching run detail style ([0653321](https://github.com/awaitstep/awaitstep.dev/commit/065332191784e34c1d026aff22653c8ebb052f38))
- **web:** point Workflows breadcrumb to /workflows ([eb2d035](https://github.com/awaitstep/awaitstep.dev/commit/eb2d03546eac7492c52b43047f681622178b83f7))
- **web:** replace CodeEditor with textarea for trigger code ([815f4d1](https://github.com/awaitstep/awaitstep.dev/commit/815f4d14ee17113f06fcb2480554c8eeba55a1e3))
- **web:** reset only non-canvas state when switching workflows ([b138582](https://github.com/awaitstep/awaitstep.dev/commit/b13858240e532f6ec27047af666b52b095f1d4d4))
- **web:** reset workflow state when switching between workflows ([d55ee6e](https://github.com/awaitstep/awaitstep.dev/commit/d55ee6e29d3ca95df209b8b98007e17ce22ff2d6))
- **web:** use breadcrumb nav for workflow detail pages ([b108100](https://github.com/awaitstep/awaitstep.dev/commit/b1081005d69a84404134c3b620ff25a373d99d40))
- **web:** use breadcrumb nav on run detail page ([b917239](https://github.com/awaitstep/awaitstep.dev/commit/b9172392deb3b9e7e701a3a35b2f0e2db1a13c75))
- **web:** use CSS truncate for workflow ID breadcrumb ([6325ebf](https://github.com/awaitstep/awaitstep.dev/commit/6325ebf63926917d80c0a65a789d36c6b83ad634))
- **web:** use eager CodeEditor import in workflow settings ([74297cd](https://github.com/awaitstep/awaitstep.dev/commit/74297cd72ddc9ff6dc579e77ee019566b5755158))
- **web:** use router.history.back() and place back link above tabs ([857b2c1](https://github.com/awaitstep/awaitstep.dev/commit/857b2c1da13a36d41026649a386601ef0a36b4f8))

### Refactoring

- class-based codegen for custom nodes + docs ([#70](https://github.com/awaitstep/awaitstep.dev/issues/70)) ([994cbbc](https://github.com/awaitstep/awaitstep.dev/commit/994cbbc543207ead5b4738acb30f82dea790bf16))
- data flow architecture, dashboard split, and cleanup ([4daa79c](https://github.com/awaitstep/awaitstep.dev/commit/4daa79c8186086e1d134615744fbfbbd24a5cc40))
- decompose page components into sub-components ([3c5c364](https://github.com/awaitstep/awaitstep.dev/commit/3c5c36488ca45fbab5521622534260c7deaa0272))
- drop generatedCode from workflow_versions ([c83d819](https://github.com/awaitstep/awaitstep.dev/commit/c83d8198a2fe629cff118e2b0691841b8c9b519a))
- extract canvas route logic into hooks and utils ([fdcfb47](https://github.com/awaitstep/awaitstep.dev/commit/fdcfb47ad726a6d60772ec6896c514edee75e766))
- extract deploy dialog into hook, util, and sub-views ([9832375](https://github.com/awaitstep/awaitstep.dev/commit/9832375b9daf3f4aae18aa529998db31a4361e18))
- extract static wrangler base config from dynamic generation ([2a8a4ef](https://github.com/awaitstep/awaitstep.dev/commit/2a8a4ef7176e6e4d475edf0ac9a1ddd863aa4e29))
- extract workflow hydration and derivation functions ([f75735a](https://github.com/awaitstep/awaitstep.dev/commit/f75735ab8abe4513faec3bba531996d71fdfbcc8))
- extract workflow save/deploy logic into hook ([06fffa8](https://github.com/awaitstep/awaitstep.dev/commit/06fffa8543516ae1eef18d561fb09549cf6e18bb))
- make worker package name configurable via APP_NAME env var ([cb6ca5b](https://github.com/awaitstep/awaitstep.dev/commit/cb6ca5be1646d76fcdecfc2c58b160f281b280ce))
- migrate useBlocker to non-deprecated API ([5365d05](https://github.com/awaitstep/awaitstep.dev/commit/5365d05ef60789a14684a93c241e2ecc7b9cf4e0))
- remove self-hosted Cloudflare connection flow ([6c0bb86](https://github.com/awaitstep/awaitstep.dev/commit/6c0bb86ca1c026fc0a3117a64bdc06a41290db15))
- service-level nodes, tests, and production fixes ([#61](https://github.com/awaitstep/awaitstep.dev/issues/61)) ([ac18481](https://github.com/awaitstep/awaitstep.dev/commit/ac18481161c49ac864f412992652421714ed6106))
- slim down canvas route to thin orchestrator ([993a283](https://github.com/awaitstep/awaitstep.dev/commit/993a2830d9cf9757667ccf0c120fa6ec2278349d))
- split canvas route into sub-components ([ad5bf4c](https://github.com/awaitstep/awaitstep.dev/commit/ad5bf4cf780d8c4ad1c3be47e57be14e13d3167b))
- standardize Zustand store access patterns ([8006f46](https://github.com/awaitstep/awaitstep.dev/commit/8006f467b0e611ecf37e8429be7f46b8f607d46b))
- stateless local dev with shared workflow preparation ([a762713](https://github.com/awaitstep/awaitstep.dev/commit/a7627136afb89c595bafb026de3eb061d9a066e3))
- unified node model — all nodes follow NodeDefinition spec ([41bcd17](https://github.com/awaitstep/awaitstep.dev/commit/41bcd179bc435182508837bfe6f77b3f831b98fe))
- use npx wrangler instead of resolving wrangler binary ([2fa554d](https://github.com/awaitstep/awaitstep.dev/commit/2fa554d98df8cdb466ddd3ed640583a43a270215))
- **web:** move Entry button from toolbar to code preview header ([7dc7a3e](https://github.com/awaitstep/awaitstep.dev/commit/7dc7a3eb746a1f1375f9842bfb9de8bbdad5ab6c))
- **web:** simplify local dev hook and remove unused UI elements ([100cd38](https://github.com/awaitstep/awaitstep.dev/commit/100cd381be8941640f3bca4c91f0a8c7ec3e1d43))

### Documentation

- add Claude Code project rules ([99ee603](https://github.com/awaitstep/awaitstep.dev/commit/99ee603c0a12eaa89e7dcf4d0f82659e0dd97729))
- add phase 1 implementation plan ([2603c97](https://github.com/awaitstep/awaitstep.dev/commit/2603c97bedf4456fce251855cf96f87ae0643b39))
- update architecture, add custom nodes and compilation docs ([ecaf180](https://github.com/awaitstep/awaitstep.dev/commit/ecaf18023695617ba2f4fb83053783c558dc25b8))
- update architecture, READMEs, and changelog for recent features ([8e6def7](https://github.com/awaitstep/awaitstep.dev/commit/8e6def76e53dadb251f47ba12c9358e069c18531))

## [1.0.4-beta.1](https://github.com/awaitstep/awaitstep.dev/compare/v1.0.3-beta.1...v1.0.4-beta.1) (2026-04-01)

### Bug Fixes

- install wrangler in Docker image for local dev support ([6b0b43f](https://github.com/awaitstep/awaitstep.dev/commit/6b0b43f02ce5618bd61417e472adc226c15d4444))

## [1.0.3-beta.1](https://github.com/awaitstep/awaitstep.dev/compare/v1.0.2-beta.1...v1.0.3-beta.1) (2026-04-01)

### Bug Fixes

- enable local dev routes in all environments ([bd3ff52](https://github.com/awaitstep/awaitstep.dev/commit/bd3ff5269aab814f99f01c2cee4468638bb22823))

## [1.0.2-beta.1](https://github.com/awaitstep/awaitstep.dev/compare/v1.0.1-beta.1...v1.0.2-beta.1) (2026-03-31)

### Bug Fixes

- SSR server config falls back to PORT env for Docker ([95ac6bb](https://github.com/awaitstep/awaitstep.dev/commit/95ac6bb9b4c23cb500847a48fafd36b8918c634a))

## [1.0.1-beta.1](https://github.com/awaitstep/awaitstep.dev/compare/v1.0.0-beta.1...v1.0.1-beta.1) (2026-03-31)

### Bug Fixes

- add packages:write permission to release workflow ([f1e1477](https://github.com/awaitstep/awaitstep.dev/commit/f1e1477cde10c4eaf692c0d6f0d9e312875577dd))
- improve install.sh with interactive prompts for all config ([769d9f2](https://github.com/awaitstep/awaitstep.dev/commit/769d9f25ff4fe02fd61de67b53a802c227e78169))
- use relative URLs for auth client in Docker builds ([3e71140](https://github.com/awaitstep/awaitstep.dev/commit/3e7114032f4128ccb523dd435f394c6d168e2120))

## [1.0.0-beta.1] - 2026-03-31

### Added

- **IR**: TriggerConfig type (http, cron, event, manual) as optional field on WorkflowIR
- **IR**: `nodeId` field on ValidationError for mapping errors to canvas nodes
- **Codegen**: `verifyCredentials()` method on WorkflowProvider interface
- **Codegen**: `destroy()` method on WorkflowProvider interface
- **Provider-Cloudflare**: Token verification via `CloudflareAPI.verifyToken()`
- **Provider-Cloudflare**: `destroy()` implementation delegating to wrangler
- **DB**: `TokenCrypto` interface for runtime-agnostic token encryption
- **DB**: AES-256-GCM encryption for API tokens at rest (Web Crypto API)
- **DB**: `deleteDeploymentsByWorkflow()` for cleanup on takedown
- **API**: Pre-deploy validation — IR validation + credential check before deploy
- **API**: `TOKEN_ENCRYPTION_KEY` required environment variable
- **Web**: IR JSON toggle on code preview panel
- **Web**: Copy-to-clipboard on code preview
- **Web**: Trigger dialog with JSON payload editor and real-time validation
- **Web**: Quick-copy curl command on deploy success and trigger dialog
- **Web**: Step status visualization on canvas during runs (complete/running/errored/pending)
- **Web**: Read-only canvas preview on run detail page
- **Web**: Run overlay store for per-node step status
- **Web**: Enhanced error display with name/message/stack and collapsible raw JSON
- **Web**: Workflow status badges on dashboard (draft/deployed/error)
- **Web**: `triggerWorkflow()` in API client
- Architecture diagram in `docs/architecture.md`
- **IR**: `NodeRegistry` class for managing node definitions at runtime
- **IR**: Bundled node definitions for all builtin types
- **Node-CLI**: `@awaitstep/node-cli` package for authoring custom node definitions with validation, template compilation, and registry bundling
- **DB**: `env_vars` table for global encrypted environment variables (unique per user+name)
- **DB**: `workflows.envVars` JSON column for workflow-level env vars
- **DB**: `resolveEnvVars()` resolves `{{global.env.NAME}}` references at query time
- **DB**: `api_keys` table with scoped authentication (read/write/deploy)
- **API**: `GET/POST/PATCH/DELETE /env-vars` routes for global env var management
- **API**: Deploy-time env var resolution and validation — blocks deploy on missing/unresolved vars
- **API**: `GET /nodes`, `GET /nodes/:id`, `GET /nodes/templates` — node registry endpoints
- **API**: `GET/POST/DELETE /api-keys` — scoped API key management (session-only)
- **Codegen**: `envVars` field on `ProviderConfig` for deploy-time injection
- **Codegen**: `{{env.NAME}}` in node config fields emits bare `env.NAME` runtime references
- **Codegen**: Generated `interface Env` auto-includes env var names from node data
- **Provider-Cloudflare**: Wrangler config `vars` for injecting env vars into Workers
- **Web**: Global env vars management page (Resources → Environment Variables) with textarea `.env` editor
- **Web**: Workflow env vars section in settings panel with `{{global.env.NAME}}` link button
- **Web**: Missing node detection — amber warning dot on canvas, destructive hint in config panel, validation error blocking deploy
- **Web**: Editable trigger code in workflow settings
- **Web**: Node registry context — loads bundled + custom node definitions from API
- **Web**: Schema-driven config panel for custom nodes via `DynamicFields`
- **Web**: Debounced input handlers on config panel fields
- **Web**: API key management page

### Changed

- License changed from MIT to Apache License 2.0
- CONTRIBUTING.md updated with env setup instructions
- PR template simplified with package checkboxes
- Takedown route now cleans up deployment records from database
- Deploy routes use `adapter.validate()` and `adapter.verifyCredentials()` instead of inline checks
- `WorkflowProvider.generate()` accepts optional `ProviderConfig` parameter for env var injection
- `EnvBinding.type` reduced to `kv`/`d1`/`r2`/`service` — secrets/variables moved to workflow env vars

### Fixed

- Deployment records are now deleted when a workflow is taken down

## [0.0.1] - 2026-03-16

### Added

- Initial monorepo scaffold with pnpm workspaces and Turborepo
- `@awaitstep/ir`: WorkflowIR types, Zod schemas, validation, serialization, expression system
- `@awaitstep/codegen`: DAG traversal, code generation framework, provider interface, esbuild transpilation
- `@awaitstep/provider-cloudflare`: Cloudflare Workflows adapter, wrangler deploy, resource browsers (KV, D1, R2)
- `@awaitstep/db`: Drizzle ORM schema for SQLite and PostgreSQL, database adapter
- `@awaitstep/api`: Hono API server with auth (GitHub, Google, Magic Links), workflow CRUD, deploy streaming (SSE), run management, resource browsing
- `@awaitstep/web`: TanStack Start frontend with ReactFlow canvas, node palette, drag-drop, edge proximity insertion, Monaco code editor, node config panel, validation panel, code preview, deploy dialog, run monitoring, workflow templates (20+), path simulation engine
- CI pipeline with GitHub Actions (type-check, lint, test)
- Authentication via better-auth (GitHub, Google OAuth, Magic Links)
- Self-hosted connection support (env var based)
- Local auto-save persistence (localStorage)
