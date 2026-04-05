# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.4.0](https://github.com/awaitstep/awaitstep/compare/v1.3.0...v1.4.0) (2026-04-05)


### Features

* landing page, custom routes, and workflow fixes ([e0ead5c](https://github.com/awaitstep/awaitstep/commit/e0ead5c13d5e4a8d837deff07411014b11e525bb))
* scaffold landing page site (apps/www) ([cf27143](https://github.com/awaitstep/awaitstep/commit/cf271432712fffb4e5a400bf7f53bfa098db2b0e))
* scaffold landing page site (apps/www) ([724d0b9](https://github.com/awaitstep/awaitstep/commit/724d0b984d6b756e73013da0995de63d5985ac29))


### Bug Fixes

* allow deleting workflow versions with existing runs/deployments ([36292b2](https://github.com/awaitstep/awaitstep/commit/36292b2b9f8049ad87001f719b2f70cb9b2b3767))
* exclude _BINDING_ID env vars from wrangler and local dev ([ce22452](https://github.com/awaitstep/awaitstep/commit/ce22452840870ed03241878d3cc6a2b7f56f7dce))
* navigate to workflows list after delete and codegen improvements ([7108f8b](https://github.com/awaitstep/awaitstep/commit/7108f8bd0ff4512db7234273bd9ba4a1839c1ad8))
* **provider-cloudflare:** exclude binding IDs from environment variables ([188fefb](https://github.com/awaitstep/awaitstep/commit/188fefb27195b308b588afcf9323fd4b583883ef))
* stop React Flow from intercepting keyboard events in side panels ([4525fad](https://github.com/awaitstep/awaitstep/commit/4525fadb4b853a221f84ec0c251945b6bfb786d9))

## [1.3.0](https://github.com/awaitstep/awaitstep/compare/v1.2.0...v1.3.0) (2026-04-04)


### Features

* add documentation site ([46986a4](https://github.com/awaitstep/awaitstep/commit/46986a4fb61399946e5715d06c4a4ad8889aa53d))
* add VitePress documentation site ([8b4447c](https://github.com/awaitstep/awaitstep/commit/8b4447c7ebc979456783ec39456a6a64fefe846f))
* support SECRET_ prefix for encrypted workflow env vars ([3a9e6cc](https://github.com/awaitstep/awaitstep/commit/3a9e6ccc3903a1586a4c4144f83f4736a0344e8c))
* workflow secret envs + http body codegen fix ([00daec8](https://github.com/awaitstep/awaitstep/commit/00daec817663ec50c14823909b44bfac84d72e4c))


### Bug Fixes

* **api:** change health check endpoint from /health to /api/health ([01aac6a](https://github.com/awaitstep/awaitstep/commit/01aac6ac64abc347acee11f84a124b8a0c830527))
* docs accuracy audit — remove fake shortcuts, fix IR example, clean unused images ([e09246c](https://github.com/awaitstep/awaitstep/commit/e09246cdf001e0f4ef87982cf7da8cb07e530e19))
* emit http body as raw JS expression and fix template bodies ([4e809d0](https://github.com/awaitstep/awaitstep/commit/4e809d0a5c3db54316042d625a5fdfe8c471bb3d))
* workflow secret envs + http body codegen fix ([c05734d](https://github.com/awaitstep/awaitstep/commit/c05734d21f67f54673585d9d5a7b44c0eb9c8d95))


### Documentation

* update repository URLs from awaitstep.dev to awaitstep ([84080a4](https://github.com/awaitstep/awaitstep/commit/84080a48ca824d5a74a8fe2cfb44deaa7d315be5))

## [1.2.0](https://github.com/awaitstep/awaitstep/compare/v1.1.2...v1.2.0) (2026-04-03)


### Features

* add base.json + overrides.json support for node versioning ([d33e6f8](https://github.com/awaitstep/awaitstep/commit/d33e6f85f503c9102e328a9499ee94ce95871b08))
* auto-detect bindings, remove resource pages, streamline deploy ([7862a4a](https://github.com/awaitstep/awaitstep/commit/7862a4a863c90b8d818b75c2c646b9e2d5cb1097))
* auto-detect resource bindings and remove CF resource pages ([ce34197](https://github.com/awaitstep/awaitstep/commit/ce34197a1d1d53a1f49ef312cd1908ef7bc0f89c))
* auto-detect resource bindings and wire into codegen/deploy ([c60a5fb](https://github.com/awaitstep/awaitstep/commit/c60a5fba71e135956d8a866314a3818af3ec5b1e))


### Bug Fixes

* add ca-certificates to Docker image for TLS support ([ea17e50](https://github.com/awaitstep/awaitstep/commit/ea17e5049ee65c16782049140b110d2861f64450))
* generate node.json from base + overrides during registry build ([13a2f5f](https://github.com/awaitstep/awaitstep/commit/13a2f5f92317aaa62ea5e327a239bde093a1b34e))
* generate node.json from base + overrides, update registry CI ([ef80e2b](https://github.com/awaitstep/awaitstep/commit/ef80e2bdc418fcf40b5b88c480a352026fdd9da5))
* **marketplace:** conditionally render dialog to fix query execution ([0a48cf0](https://github.com/awaitstep/awaitstep/commit/0a48cf02f05df42c1d9a7e49445e118ac9956034))
* resolve binding IDs from env vars, add nullable connection_id migration ([1b494c4](https://github.com/awaitstep/awaitstep/commit/1b494c4d14b035b8bfbc12fab57594b13e77e6ed))


### Refactoring

* add floating bindings panel, remove manual binding UI and input params ([a88c243](https://github.com/awaitstep/awaitstep/commit/a88c2439d0a374e50fb0d29cd939c1ec78ae908f))
* **router:** restructure routes by moving env-vars out of resources ([96161b6](https://github.com/awaitstep/awaitstep/commit/96161b638d47e9f34124984fa008798c05d2e973))
* **ui:** adjust error display and placeholder contrast ([b8e5022](https://github.com/awaitstep/awaitstep/commit/b8e5022d7be0dd9722cfd8f44a1ea88bc590c534))

## [1.1.2](https://github.com/awaitstep/awaitstep/compare/v1.1.1...v1.1.2) (2026-04-03)


### Bug Fixes

* baseURL init order and registry URL update ([3a71a62](https://github.com/awaitstep/awaitstep/commit/3a71a620c1a326f78c1cb6e344c078648b324a20))
* move baseURL declaration before email service init ([67431e4](https://github.com/awaitstep/awaitstep/commit/67431e4d74933acbf10512a6d0ecaee68cebf641))

## [1.1.1](https://github.com/awaitstep/awaitstep/compare/v1.1.0...v1.1.1) (2026-04-03)


### Bug Fixes

* **connections:** handle JSON parsing errors in credential redaction ([77e96f7](https://github.com/awaitstep/awaitstep/commit/77e96f7a24f2b8e629aad18f042d09c190f4365e))
* **email:** pass appUrl to magic link email template ([a5e483c](https://github.com/awaitstep/awaitstep/commit/a5e483c7fa0beb0ba3ca7db2b8b4df0fb7b30f37))
* **sign-in:** replace error state with toast notifications ([6ff1eae](https://github.com/awaitstep/awaitstep/commit/6ff1eae1d9d8d1275461d054e398a2c5ee7a3b9e))
* **sign-in:** replace error state with toast notifications ([ee8ff7e](https://github.com/awaitstep/awaitstep/commit/ee8ff7ec080fdc03333b9bc883f4ff42bb30cb24))
* split API and web into separate servers, decouple SSL from URL ([1c1e72f](https://github.com/awaitstep/awaitstep/commit/1c1e72f4f7a84efa0b2f8a28a660b12177740fbb))

## [1.1.0](https://github.com/awaitstep/awaitstep/compare/v1.0.0...v1.1.0) (2026-04-03)

### Features

- **web:** add favicon to web application ([7f6f662](https://github.com/awaitstep/awaitstep/commit/7f6f662a5c4004f6a6404b84ee7f8c23552e2089))

### Documentation

- add AI usage policy ([ee9adb0](https://github.com/awaitstep/awaitstep/commit/ee9adb095c67a82df560c4769eb9647a1bc04244))
- add security policy ([6abb65e](https://github.com/awaitstep/awaitstep/commit/6abb65ea266c862c7096a5706e061d52ea09ac15))
- add security policy and AI usage policy ([cad6907](https://github.com/awaitstep/awaitstep/commit/cad69076ca9635685377ef2204ece642a0836008))
- add security policy, AI usage policy, and PR AI disclosure ([fd7cc68](https://github.com/awaitstep/awaitstep/commit/fd7cc68d8c50a55d5ea39e985e8cdfdce90a2507))
- link policies from README, CONTRIBUTING, and PR template ([ef967c9](https://github.com/awaitstep/awaitstep/commit/ef967c974e1ad7b4939c0e428d4f7d655a883f6d))
- rewrite README as feature-focused landing page ([6d85242](https://github.com/awaitstep/awaitstep/commit/6d85242aae9bab633952e14b60669097255f56cf))
- rewrite README as feature-focused landing page ([49923ee](https://github.com/awaitstep/awaitstep/commit/49923ee7b77898df947e6c4a5cc6e08fe27c92c1))

## 1.0.0 (2026-04-03)

### Features

- **account:** conditionally render connected accounts based on enabled OAuth providers ([174b581](https://github.com/awaitstep/awaitstep/commit/174b581fc34f8543e4e98a0b13ad5acfb3ccb05d))
- add 28 new registry nodes + audit fixes across all 44 nodes ([369b09c](https://github.com/awaitstep/awaitstep/commit/369b09cd293184b620a584ad68084a75f4248e1f))
- add logo and update email branding ([535a4e1](https://github.com/awaitstep/awaitstep/commit/535a4e164a7bafc94e86a6e9d0f6080790331403))
- add mailgun_send_email node to registry ([#59](https://github.com/awaitstep/awaitstep/issues/59)) ([16957ef](https://github.com/awaitstep/awaitstep/commit/16957efb6f006d5ae42f754bab8b204127f6632c))
- add request logger, fix session rate limiting, and 404 page ([13e35c3](https://github.com/awaitstep/awaitstep/commit/13e35c3701d36b2137d9b2975c936fc576d350ba))
- API key management UI and database migration ([0c14408](https://github.com/awaitstep/awaitstep/commit/0c144084ccdc97cc8c3f9399803d0e0d18b46b5c))
- API playground and endpoint documentation ([1a6ab24](https://github.com/awaitstep/awaitstep/commit/1a6ab24b49038a0b3e3edf4365362da601b30a6a))
- **api:** API security hardening and structured logging ([4a79cab](https://github.com/awaitstep/awaitstep/commit/4a79cab7417376205b850be2494fb60f2ca74662))
- **auth:** enable user deletion and conditional magic link plugin ([2edbd3e](https://github.com/awaitstep/awaitstep/commit/2edbd3e62abb2d021d47aa42560268bc7b1e736c))
- build-time node registry with API endpoints ([e59dfc3](https://github.com/awaitstep/awaitstep/commit/e59dfc3c61185f48d8c9e5065deec6e9beb999e1))
- custom node improvements (deps, codegen, defaults, icons) ([7b1eac3](https://github.com/awaitstep/awaitstep/commit/7b1eac3765827bcc81ed4285870c0e4900c9b7e6))
- custom node template compilation for codegen ([3893b7b](https://github.com/awaitstep/awaitstep/commit/3893b7ba02ef1e05dff31b27e12c0f38f84ae7d4))
- custom nodes IR foundation and dispatch hardening ([60d6798](https://github.com/awaitstep/awaitstep/commit/60d6798a9fa1087f01727d9f171ebe27863d3271))
- custom nodes Phase 2 — registry-driven palette and schema-driven config ([2d230dd](https://github.com/awaitstep/awaitstep/commit/2d230dddbe80f675c349aab300d1cda6c6cfd2de))
- debounce config panel input onChange handlers ([14716ed](https://github.com/awaitstep/awaitstep/commit/14716eda9805ac059ee7eace623e20ba84660b27))
- editable trigger code in workflow settings ([7320219](https://github.com/awaitstep/awaitstep/commit/7320219917c026d963fc82221a050f6cd48c81c5))
- environment variable management + missing node detection ([72b8c7d](https://github.com/awaitstep/awaitstep/commit/72b8c7db4c650a2a76a82fa834ca96ce38c64de8))
- frontend org/project context, switcher, and setup ([a0cb640](https://github.com/awaitstep/awaitstep/commit/a0cb640260a450aa6888471992cce9516a7dc3b2))
- local workflow testing with wrangler dev ([41c6bb8](https://github.com/awaitstep/awaitstep/commit/41c6bb89dbc7031b6329dc5029413aa120f1528a))
- node-author agent, /create-node skill, and authoring guide ([dd4fa79](https://github.com/awaitstep/awaitstep/commit/dd4fa797827f222b0bb73f7dc55c11430ca6af71))
- node-cli with generate command and example node ([001b551](https://github.com/awaitstep/awaitstep/commit/001b551d01bcfc3a9a346087d21c5b8f84483d31))
- npm dependency support for workflows ([dc3f022](https://github.com/awaitstep/awaitstep/commit/dc3f022086f93a82f3d721335e297b0f16167d1e))
- organizations and projects ownership model ([abe191f](https://github.com/awaitstep/awaitstep/commit/abe191f51f10fb56e42b10edf90a6914904072e6))
- persist workflow env vars to DB and load on open ([922db4a](https://github.com/awaitstep/awaitstep/commit/922db4a7d92e008e2e1b468d4bf00aeee1d2866c))
- Phase 1 audit gap implementations ([a76f1c3](https://github.com/awaitstep/awaitstep/commit/a76f1c3bbd3a6185c7ea09204d72279967fc0209))
- preview mode for codegen hides node class implementations ([5a89a56](https://github.com/awaitstep/awaitstep/commit/5a89a5600bfa2221eb78e39972b2531f8ee3a0f3))
- preview mode for codegen hides node class implementations ([b770b76](https://github.com/awaitstep/awaitstep/commit/b770b762a1c3cd9a0b36a5aa22aec17347c8000e))
- preview mode for codegen hides node class implementations ([c220b81](https://github.com/awaitstep/awaitstep/commit/c220b8188aae191781b23a574872d77c72c70340))
- preview mode for codegen hides node class implementations ([c96274d](https://github.com/awaitstep/awaitstep/commit/c96274d2a5d63121970f698c0be6d9c015de6c20))
- preview mode for codegen hides node class implementations ([369b09c](https://github.com/awaitstep/awaitstep/commit/369b09cd293184b620a584ad68084a75f4248e1f))
- redesign homepage with handwritten hero and feature grid ([b86cd6d](https://github.com/awaitstep/awaitstep/commit/b86cd6d7dcd7023dd6ec58271f660298b90625fc))
- remote node registry with marketplace ([e2a39ea](https://github.com/awaitstep/awaitstep/commit/e2a39ea19a845551dbbc39d82ed095dd8c9483ad))
- settings, security, onboarding, and code quality improvements ([e510d8f](https://github.com/awaitstep/awaitstep/commit/e510d8f4eaf9f174a8120c5d36573c3cf123bda3))
- smart install script with auto Caddy setup ([20c6979](https://github.com/awaitstep/awaitstep/commit/20c697963f28754ce02050539e21426ff9d6c34f))
- visual canvas and deployment v0.0.1 ([e5a2cd9](https://github.com/awaitstep/awaitstep/commit/e5a2cd9643d5f691cbfb0bf7dd0216944538b183))
- **web:** add new logo and update branding colors ([087cb43](https://github.com/awaitstep/awaitstep/commit/087cb43a4cb5c50f79208f42467715f8f83fdbde))
- **web:** breadcrumb navigation and card list redesign ([b123d75](https://github.com/awaitstep/awaitstep/commit/b123d75cd00644b8526e13df4fd1a7e9216241a4))
- **web:** move trigger code editor to its own overlay dialog ([dc19196](https://github.com/awaitstep/awaitstep/commit/dc19196793d3deb4665f949708b4ce48d9397234))
- workflow versioning suite ([390b12c](https://github.com/awaitstep/awaitstep/commit/390b12c2c5487d21f7bd2c0b8a973c70f6a84c0d))

### Bug Fixes

- add curl to Docker image for healthcheck support ([56eacba](https://github.com/awaitstep/awaitstep/commit/56eacbae78db950b718838e473c8b609fb264469))
- add curl to Docker image for healthcheck support ([468bfed](https://github.com/awaitstep/awaitstep/commit/468bfed29039ae5aab1976ff879fe2819392118a))
- add packages:write permission to release workflow ([f03b45f](https://github.com/awaitstep/awaitstep/commit/f03b45fb98e0c9220926ed2ebf1be2514427e0c9))
- API security hardening and dependency patches ([b47ab91](https://github.com/awaitstep/awaitstep/commit/b47ab9167ca8e5d227b72232390c21b2f5452955))
- **api:** sanitize workflow name in CF API calls for run operations ([25b6180](https://github.com/awaitstep/awaitstep/commit/25b6180331c7b48d9dbbbdf15dd54c8ceb6f2b9a))
- checksum mismatch in registry client ([#56](https://github.com/awaitstep/awaitstep/issues/56)) ([9466339](https://github.com/awaitstep/awaitstep/commit/94663392d0e3968b5db58e14357ae69e28e800a6))
- CI workflow formatting and bug fixes ([#58](https://github.com/awaitstep/awaitstep/issues/58)) ([9eae7c0](https://github.com/awaitstep/awaitstep/commit/9eae7c030fb241c0897f08ef64d534e7cab5ae66))
- **cloudflare:** bind wrangler dev to 0.0.0.0 and remove global install ([ee78e88](https://github.com/awaitstep/awaitstep/commit/ee78e886368952d242e9d1a399cf9a0058a23d5e))
- **codegen:** rewrite env. to this.env. inside workflow run() body ([c22b6a9](https://github.com/awaitstep/awaitstep/commit/c22b6a9c87482d6f4601e94d53ae6247a8494f91))
- commit registry index.json and upgrade CI to Node 22 ([0b56dc3](https://github.com/awaitstep/awaitstep/commit/0b56dc3ed3653837d2e370ae37e906f2340ecbd1))
- **deploy:** use wrangler secret put for secrets instead of .env file ([9b041c3](https://github.com/awaitstep/awaitstep/commit/9b041c354c9d50a8137f7e96998b8b21c4c92def))
- **deploy:** write .env file for wrangler and separate secrets from vars ([0795c28](https://github.com/awaitstep/awaitstep/commit/0795c28a30537e4364c04c4cc08cf0f0ae10d3d4))
- dismissable org/project dialogs with centralized guards ([701831d](https://github.com/awaitstep/awaitstep/commit/701831d1b0041f0a67878497f11defd5231b4298))
- enable local dev routes in all environments ([284ff2d](https://github.com/awaitstep/awaitstep/commit/284ff2d47af4ba680be7c9996b303b8bb98c032b))
- enable local dev routes in all environments ([9ea295a](https://github.com/awaitstep/awaitstep/commit/9ea295ad9b42eab9a83fd33e49a37c8e2f8dad83))
- improve install.sh with interactive prompts for all config ([af165f4](https://github.com/awaitstep/awaitstep/commit/af165f439462f0571886e783408b2e9eecc09d26))
- install wrangler in Docker image for local dev support ([b420661](https://github.com/awaitstep/awaitstep/commit/b42066164d6870be77462dda90588c195d6133b9))
- install wrangler in Docker image for local dev support ([33514e4](https://github.com/awaitstep/awaitstep/commit/33514e459cb44907b66b0a68dba59f86bbc3c0c6))
- local dev cleanup, ENABLE_LOCAL_DEV gate, clipboard fallback ([0aa50bd](https://github.com/awaitstep/awaitstep/commit/0aa50bdc738b50bbe1be054bccc7579d40ff17bc))
- **org-dialog:** set active organization after creation for new users ([f0f7f7d](https://github.com/awaitstep/awaitstep/commit/f0f7f7d6296b339fceb845c77146e281560c9d19))
- qualify outer table column in correlated subqueries ([16e6757](https://github.com/awaitstep/awaitstep/commit/16e67575ee1b5e9862542e066281155dc8fab617))
- resolve Dependabot security alerts for picomatch, srvx, undici ([0db5335](https://github.com/awaitstep/awaitstep/commit/0db53356d36d26c448360fac20658a372b5ebef6))
- resolve merge conflicts from main, restore dev versions ([195198c](https://github.com/awaitstep/awaitstep/commit/195198c53b32767d55e3bf1c58ce37968e8998cf))
- security cleanup and persist trigger code to DB ([c55d1e5](https://github.com/awaitstep/awaitstep/commit/c55d1e5f7164c73115d02e86665b28aeea5b9e29))
- silence zustand persist SSR warnings with createJSONStorage ([2edafad](https://github.com/awaitstep/awaitstep/commit/2edafada6eb2cc5deeb16963d8b48d25730825d8))
- SSR server config falls back to PORT env for Docker ([cc81318](https://github.com/awaitstep/awaitstep/commit/cc813183f2ab0c0aed0e9d24e7efad80cc1c98a3))
- switch Docker base to node:22-slim for workerd compatibility ([24403ea](https://github.com/awaitstep/awaitstep/commit/24403eaccee9a77e8a955e3d20db06c2d642d1b7))
- uninstall UI bug, brand icons, remove local resend node ([#57](https://github.com/awaitstep/awaitstep/issues/57)) ([0788fc3](https://github.com/awaitstep/awaitstep/commit/0788fc3e3f45f7473ac4addcddc5442355e6cb55))
- use loader instead of beforeLoad for local dev flag ([ba6f5d4](https://github.com/awaitstep/awaitstep/commit/ba6f5d4136b8d3c79dcb25ff44bb667bb1e8edd2))
- use relative URLs for auth client in Docker builds ([32798df](https://github.com/awaitstep/awaitstep/commit/32798df21a6588aa14b9588dd09aad95ce4702a1))
- use valid category values in node definitions ([#62](https://github.com/awaitstep/awaitstep/issues/62)) ([415972a](https://github.com/awaitstep/awaitstep/commit/415972aec8225fa3943d047d22b9a52db872d458))
- **web:** add back navigation arrow to workflow detail layout ([0d3c9db](https://github.com/awaitstep/awaitstep/commit/0d3c9db60d81428172b8a8712f596dea181102cd))
- **web:** add label editing for branch conditions ([24e5be2](https://github.com/awaitstep/awaitstep/commit/24e5be2526258d0e88148e0eeb432834ef1b4488))
- **web:** defer CodeEditor mount in settings to prevent flash ([79d6f6f](https://github.com/awaitstep/awaitstep/commit/79d6f6f80ed3a4a2d61acbba0a2b53341820e4d5))
- **web:** eagerly import WorkflowSettings to eliminate toggle flash ([19319ae](https://github.com/awaitstep/awaitstep/commit/19319ae671df5fa3d67c3d930c89afc647aed7d9))
- **web:** isolate trigger code editor into lazy-loaded component ([e2ffb5b](https://github.com/awaitstep/awaitstep/commit/e2ffb5bf8cc37b5e26891dcf55c8c9937813faeb))
- **web:** lazy-load code editor in workflow settings to prevent flash ([4a0aef3](https://github.com/awaitstep/awaitstep/commit/4a0aef32384388836ead36497daf3f102e6ba1b1))
- **web:** lazy-load WorkflowSettings to prevent flash on toggle ([cd53ce2](https://github.com/awaitstep/awaitstep/commit/cd53ce2db3ac7598757b0ba24544eefe3c2855f8))
- **web:** make Workflows breadcrumb clickable and show workflow ID ([5690075](https://github.com/awaitstep/awaitstep/commit/569007578ac6b473d554e0cdba05be41c20c2d12))
- **web:** move back link to content area matching run detail style ([bf4af03](https://github.com/awaitstep/awaitstep/commit/bf4af03a5a0e2d7ec47f5b1e1eef5d18fc05ae2d))
- **web:** point Workflows breadcrumb to /workflows ([6fa7b5c](https://github.com/awaitstep/awaitstep/commit/6fa7b5c0ce22a09764794137d6bc883f7ef87dc8))
- **web:** replace CodeEditor with textarea for trigger code ([fb3d9b9](https://github.com/awaitstep/awaitstep/commit/fb3d9b95e759c0f844ccfe6620641f3fb7984cb0))
- **web:** reset only non-canvas state when switching workflows ([7d3fbdc](https://github.com/awaitstep/awaitstep/commit/7d3fbdcfce72a06171073ea4545eaf48af6320ca))
- **web:** reset workflow state when switching between workflows ([8facc0d](https://github.com/awaitstep/awaitstep/commit/8facc0dee31c6e136ddff057e3b8e17551299d99))
- **web:** use breadcrumb nav for workflow detail pages ([8e33397](https://github.com/awaitstep/awaitstep/commit/8e3339773ea8cca694370147aea3662827552c75))
- **web:** use breadcrumb nav on run detail page ([34a4c57](https://github.com/awaitstep/awaitstep/commit/34a4c57f54019437c8be3e9610d7e724718c3d64))
- **web:** use CSS truncate for workflow ID breadcrumb ([5e7ccb5](https://github.com/awaitstep/awaitstep/commit/5e7ccb5e10031d2e2d681636ab56e8bbac2ee25f))
- **web:** use eager CodeEditor import in workflow settings ([b23b307](https://github.com/awaitstep/awaitstep/commit/b23b3074f313db531ca09f10c4b642ab11df7ca4))
- **web:** use router.history.back() and place back link above tabs ([4ce2faa](https://github.com/awaitstep/awaitstep/commit/4ce2faa7fe760f81f262794e31aeb2e976a0cc6a))

### Refactoring

- class-based codegen for custom nodes + docs ([#70](https://github.com/awaitstep/awaitstep/issues/70)) ([1983c11](https://github.com/awaitstep/awaitstep/commit/1983c1102ca8b5c9cceb49db85ef2ef30e3d121e))
- data flow architecture, dashboard split, and cleanup ([ece826e](https://github.com/awaitstep/awaitstep/commit/ece826ed01521822bf7097e8d99155513ff8c4f9))
- decompose page components into sub-components ([bc2e3ad](https://github.com/awaitstep/awaitstep/commit/bc2e3ad2bd309489c448e228d926418c3c5767bb))
- drop generatedCode from workflow_versions ([e809ea3](https://github.com/awaitstep/awaitstep/commit/e809ea301f4cb8696d1b2d86e616044174228b6c))
- extract canvas route logic into hooks and utils ([f8349d3](https://github.com/awaitstep/awaitstep/commit/f8349d34c7e6c4bbb4ee46cd05a226daf5ad97b4))
- extract deploy dialog into hook, util, and sub-views ([97eb14f](https://github.com/awaitstep/awaitstep/commit/97eb14fb6631014f4cdce741ce1152569c51424e))
- extract static wrangler base config from dynamic generation ([0db0ed0](https://github.com/awaitstep/awaitstep/commit/0db0ed0aa5c2daaf90f328e754e9b59214ab5c2d))
- extract workflow hydration and derivation functions ([09ae4e3](https://github.com/awaitstep/awaitstep/commit/09ae4e3fcbf4fe95d88a0f47764f1e5b89bbcb25))
- extract workflow save/deploy logic into hook ([de3541c](https://github.com/awaitstep/awaitstep/commit/de3541c49868b087dabf37436e1b34af2ed34c0b))
- make worker package name configurable via APP_NAME env var ([0a01583](https://github.com/awaitstep/awaitstep/commit/0a01583fd542c9514d38154ecdf3d31d8f548319))
- migrate useBlocker to non-deprecated API ([061f158](https://github.com/awaitstep/awaitstep/commit/061f1583429606a39ec20f52969aac53364fd2bf))
- remove self-hosted Cloudflare connection flow ([8d7a45d](https://github.com/awaitstep/awaitstep/commit/8d7a45d779c51efa725a3ee30e80d47549c36f74))
- service-level nodes, tests, and production fixes ([#61](https://github.com/awaitstep/awaitstep/issues/61)) ([d5ff7fa](https://github.com/awaitstep/awaitstep/commit/d5ff7faee005ee62684fe3d27eb4aa9316d0f619))
- slim down canvas route to thin orchestrator ([2902ee2](https://github.com/awaitstep/awaitstep/commit/2902ee280a43815aa8c9da10922189dbcffdba4f))
- split canvas route into sub-components ([4c1692f](https://github.com/awaitstep/awaitstep/commit/4c1692f907bf8ca8eeca88605e7b9844a28bfb10))
- standardize Zustand store access patterns ([8256836](https://github.com/awaitstep/awaitstep/commit/8256836a0a9d0f894280deacad45ec70ddb3e093))
- stateless local dev with shared workflow preparation ([fa90e73](https://github.com/awaitstep/awaitstep/commit/fa90e73f5970fcc490353fd25c8b3c0095e24fb0))
- unified node model — all nodes follow NodeDefinition spec ([c015dd2](https://github.com/awaitstep/awaitstep/commit/c015dd299f578b15274bb0b04c22794c58440fa0))
- use npx wrangler instead of resolving wrangler binary ([2405511](https://github.com/awaitstep/awaitstep/commit/2405511f5aaa9ee3feedeea84164cd8cc5e6ad5a))
- **web:** move Entry button from toolbar to code preview header ([60b5be4](https://github.com/awaitstep/awaitstep/commit/60b5be47c6ecad310bb78e3d5b68b14875e416ec))
- **web:** simplify local dev hook and remove unused UI elements ([98d2a34](https://github.com/awaitstep/awaitstep/commit/98d2a34d060d2ad3dc4ae3f60daa7716bc1e236e))

### Performance

- replace vite-tsconfig-paths plugin with native resolve.tsconfigPaths ([7037ead](https://github.com/awaitstep/awaitstep/commit/7037ead66efdb62e420234536ef71b7c15e434cc))
- replace vite-tsconfig-paths with native Vite 8 resolution ([940032a](https://github.com/awaitstep/awaitstep/commit/940032a74872cfed113abb0b08122224c3c2de64))

### Documentation

- add Claude Code project rules ([99ee603](https://github.com/awaitstep/awaitstep/commit/99ee603c0a12eaa89e7dcf4d0f82659e0dd97729))
- add phase 1 implementation plan ([2603c97](https://github.com/awaitstep/awaitstep/commit/2603c97bedf4456fce251855cf96f87ae0643b39))
- update architecture, add custom nodes and compilation docs ([f92afc3](https://github.com/awaitstep/awaitstep/commit/f92afc3a7eb3fa213ce1418f771108704402502a))
- update architecture, READMEs, and changelog for recent features ([b4cc151](https://github.com/awaitstep/awaitstep/commit/b4cc151015b5faae4888825367b44cd1bfa539d4))

## [1.1.0-beta.1](https://github.com/awaitstep/awaitstep/compare/v1.0.1-beta.1...v1.1.0-beta.1) (2026-04-02)

### Features

- **account:** conditionally render connected accounts based on enabled OAuth providers ([9124d8e](https://github.com/awaitstep/awaitstep/commit/9124d8ea829200cdba2acfc9d93261715672e87b))
- add 28 new registry nodes + audit fixes across all 44 nodes ([890dbc1](https://github.com/awaitstep/awaitstep/commit/890dbc1bc066761b4f170e495b1c33e6e4025473))
- add logo and update email branding ([ccfe0cc](https://github.com/awaitstep/awaitstep/commit/ccfe0ccc12248b46f240b6bde3dcaf0a59eac721))
- add mailgun_send_email node to registry ([#59](https://github.com/awaitstep/awaitstep/issues/59)) ([6994ff8](https://github.com/awaitstep/awaitstep/commit/6994ff82bb5af6429919c679ee87350fe454ad3e))
- add request logger, fix session rate limiting, and 404 page ([a136c7d](https://github.com/awaitstep/awaitstep/commit/a136c7dacb012662ad159c3448e9157429ad91d9))
- API key management UI and database migration ([f012f63](https://github.com/awaitstep/awaitstep/commit/f012f63d264c82776bd1aaa21e57be5a663f4610))
- API playground and endpoint documentation ([d30b531](https://github.com/awaitstep/awaitstep/commit/d30b531f582f961f207bd9f782e38b5363d4bf1f))
- **api:** API security hardening and structured logging ([f5d07a1](https://github.com/awaitstep/awaitstep/commit/f5d07a144e1aa0e004a9cf8aabad6735f1e0b3f3))
- **auth:** enable user deletion and conditional magic link plugin ([4db04ca](https://github.com/awaitstep/awaitstep/commit/4db04cab27ca2375eab66e87699e0d328e077efc))
- build-time node registry with API endpoints ([0f7c75e](https://github.com/awaitstep/awaitstep/commit/0f7c75e5a392a2245e94de34c0a446089c009c19))
- custom node improvements (deps, codegen, defaults, icons) ([4d820e2](https://github.com/awaitstep/awaitstep/commit/4d820e230385702eedb83f1a7f641093a73fbbdc))
- custom node template compilation for codegen ([3a5e4a2](https://github.com/awaitstep/awaitstep/commit/3a5e4a230ab1fa1f11b936d23736ae2211ed9aea))
- custom nodes IR foundation and dispatch hardening ([7e3bf88](https://github.com/awaitstep/awaitstep/commit/7e3bf88aaac11e851cf13d537a067cfe6c353645))
- custom nodes Phase 2 — registry-driven palette and schema-driven config ([07351b9](https://github.com/awaitstep/awaitstep/commit/07351b991a4c6beda51e5484d03caa743afacc3c))
- debounce config panel input onChange handlers ([ac1193a](https://github.com/awaitstep/awaitstep/commit/ac1193a4c764cbe9228aeee4d220413b4eae6a81))
- editable trigger code in workflow settings ([af65a3c](https://github.com/awaitstep/awaitstep/commit/af65a3c86dd12a7aa7381c781aa61515fd5d830b))
- environment variable management + missing node detection ([0d23ea9](https://github.com/awaitstep/awaitstep/commit/0d23ea9fbecffeedaff9357c71efdd223652928e))
- frontend org/project context, switcher, and setup ([1329997](https://github.com/awaitstep/awaitstep/commit/1329997d3d5647da75e1f291ae070df4b9c55315))
- local workflow testing with wrangler dev ([23d6c74](https://github.com/awaitstep/awaitstep/commit/23d6c7421709bd00c49ad3857dd341c3bb293855))
- node-author agent, /create-node skill, and authoring guide ([bde988b](https://github.com/awaitstep/awaitstep/commit/bde988b06fa0d943ebdcdfdb54a2953618a6ba62))
- node-cli with generate command and example node ([c451dc1](https://github.com/awaitstep/awaitstep/commit/c451dc1b85ec7077bf22feac6e3f20cd5ba617be))
- npm dependency support for workflows ([a532679](https://github.com/awaitstep/awaitstep/commit/a5326795bf216b7fedba51bbe29303b8b0e5e845))
- organizations and projects ownership model ([a00b23b](https://github.com/awaitstep/awaitstep/commit/a00b23b2fe2ab0d9844065719adec87fa1e90312))
- persist workflow env vars to DB and load on open ([3e043be](https://github.com/awaitstep/awaitstep/commit/3e043be7661516bc40aa7309f16aab561dace990))
- Phase 1 audit gap implementations ([afefb20](https://github.com/awaitstep/awaitstep/commit/afefb20811a7eb9d6eb6e04ac8f5936b1ec721a4))
- preview mode for codegen hides node class implementations ([a5fa0e8](https://github.com/awaitstep/awaitstep/commit/a5fa0e89ce6cb44a5cc5d089b3f027d053542f50))
- preview mode for codegen hides node class implementations ([09388ae](https://github.com/awaitstep/awaitstep/commit/09388ae0a84d36c584895dd210f82675752fee92))
- preview mode for codegen hides node class implementations ([8eb883f](https://github.com/awaitstep/awaitstep/commit/8eb883f4d68ae2e19a0f4f9af81176f3334d4876))
- preview mode for codegen hides node class implementations ([3a89b7a](https://github.com/awaitstep/awaitstep/commit/3a89b7a9f3c9bb419af29b43fed35c293cb16d0b))
- preview mode for codegen hides node class implementations ([890dbc1](https://github.com/awaitstep/awaitstep/commit/890dbc1bc066761b4f170e495b1c33e6e4025473))
- redesign homepage with handwritten hero and feature grid ([c4623ca](https://github.com/awaitstep/awaitstep/commit/c4623ca1a9ece74573fb94d0d8dd941caff449be))
- remote node registry with marketplace ([0c7e438](https://github.com/awaitstep/awaitstep/commit/0c7e4384afa9c408c4d5cdc19a5df627bf93e4d2))
- settings, security, onboarding, and code quality improvements ([58e255b](https://github.com/awaitstep/awaitstep/commit/58e255bb0ee177b8a4325dce3353342527b79254))
- smart install script with auto Caddy setup ([e24fe19](https://github.com/awaitstep/awaitstep/commit/e24fe19f69caa9d6048a01b2e4efcb7d47d358cf))
- visual canvas and deployment v0.0.1 ([4bb54fb](https://github.com/awaitstep/awaitstep/commit/4bb54fb16861fb4cd67a7880abcb84ac5b85b06b))
- **web:** add new logo and update branding colors ([947ff1c](https://github.com/awaitstep/awaitstep/commit/947ff1cc5ad323a0b7f77b91fb6a45eff5bc37c2))
- **web:** breadcrumb navigation and card list redesign ([2028f70](https://github.com/awaitstep/awaitstep/commit/2028f70b58fab1b8d9e1f3ea45738cd6c0fb156d))
- **web:** move trigger code editor to its own overlay dialog ([e5c1e6f](https://github.com/awaitstep/awaitstep/commit/e5c1e6fb807eac6b4dac30af6ad670d4e34dd21c))
- workflow versioning suite ([69b0582](https://github.com/awaitstep/awaitstep/commit/69b0582d2853fcfa30bd3947800b071c5aedb47a))

### Bug Fixes

- add packages:write permission to release workflow ([f1e1477](https://github.com/awaitstep/awaitstep/commit/f1e1477cde10c4eaf692c0d6f0d9e312875577dd))
- API security hardening and dependency patches ([494ce27](https://github.com/awaitstep/awaitstep/commit/494ce2761ff7609ac9428bb0fd6c88dcbc5554ed))
- **api:** sanitize workflow name in CF API calls for run operations ([18e3ee7](https://github.com/awaitstep/awaitstep/commit/18e3ee7afb6395ecd71e4007f1093071c85fc027))
- checksum mismatch in registry client ([#56](https://github.com/awaitstep/awaitstep/issues/56)) ([005d69d](https://github.com/awaitstep/awaitstep/commit/005d69d6165b79bf43d54bc75037e43647fe3307))
- CI workflow formatting and bug fixes ([#58](https://github.com/awaitstep/awaitstep/issues/58)) ([e213d54](https://github.com/awaitstep/awaitstep/commit/e213d547f3a0e2a848b52848d85c14f820467ca7))
- **cloudflare:** bind wrangler dev to 0.0.0.0 and remove global install ([0c49490](https://github.com/awaitstep/awaitstep/commit/0c49490788002f1fc961a6f12623f206e8c2e369))
- **codegen:** rewrite env. to this.env. inside workflow run() body ([9a01371](https://github.com/awaitstep/awaitstep/commit/9a013713855c28af7c4d3fa24e0aeaecc27dcdc2))
- commit registry index.json and upgrade CI to Node 22 ([699cfa4](https://github.com/awaitstep/awaitstep/commit/699cfa451864486e89bec394d76d43f0ec1d77fd))
- **deploy:** use wrangler secret put for secrets instead of .env file ([19bf1f0](https://github.com/awaitstep/awaitstep/commit/19bf1f057554766362b0911212d3a46e3f5606ce))
- **deploy:** write .env file for wrangler and separate secrets from vars ([4b8f374](https://github.com/awaitstep/awaitstep/commit/4b8f374c83687bd7ae5424c5cda847956bb01e5c))
- dismissable org/project dialogs with centralized guards ([0b0d0a9](https://github.com/awaitstep/awaitstep/commit/0b0d0a902801de8c5fc3bb1bdf335158edabffda))
- enable local dev routes in all environments ([bd3ff52](https://github.com/awaitstep/awaitstep/commit/bd3ff5269aab814f99f01c2cee4468638bb22823))
- enable local dev routes in all environments ([eccc273](https://github.com/awaitstep/awaitstep/commit/eccc2738554be20fba159646d8ec7989cedee39a))
- improve install.sh with interactive prompts for all config ([769d9f2](https://github.com/awaitstep/awaitstep/commit/769d9f25ff4fe02fd61de67b53a802c227e78169))
- install wrangler in Docker image for local dev support ([6b0b43f](https://github.com/awaitstep/awaitstep/commit/6b0b43f02ce5618bd61417e472adc226c15d4444))
- install wrangler in Docker image for local dev support ([5d3250e](https://github.com/awaitstep/awaitstep/commit/5d3250ed6e66453c59efb1942a39a14cab189aee))
- local dev cleanup, ENABLE_LOCAL_DEV gate, clipboard fallback ([e40d31d](https://github.com/awaitstep/awaitstep/commit/e40d31dce17862eac39fa123c2d66d9bb02ae116))
- **org-dialog:** set active organization after creation for new users ([7d2dd82](https://github.com/awaitstep/awaitstep/commit/7d2dd822c35f0d27dc1a22180ff280fd8b3001b9))
- qualify outer table column in correlated subqueries ([d837554](https://github.com/awaitstep/awaitstep/commit/d8375542506bbb35d328869e4f70fe46a214e2ca))
- resolve Dependabot security alerts for picomatch, srvx, undici ([6e871ef](https://github.com/awaitstep/awaitstep/commit/6e871effff7426ac414b24065b4bf4dd4e0ef164))
- resolve merge conflicts from main, restore dev versions ([33b1b8c](https://github.com/awaitstep/awaitstep/commit/33b1b8cb16ed287d77fb67db6efe4eb5459ba63f))
- security cleanup and persist trigger code to DB ([59700f7](https://github.com/awaitstep/awaitstep/commit/59700f70a0aaefc621cc912d8771d8abce2d1eca))
- silence zustand persist SSR warnings with createJSONStorage ([b56efa8](https://github.com/awaitstep/awaitstep/commit/b56efa83a47cca136d652148a448065eb101d4e6))
- SSR server config falls back to PORT env for Docker ([95ac6bb](https://github.com/awaitstep/awaitstep/commit/95ac6bb9b4c23cb500847a48fafd36b8918c634a))
- switch Docker base to node:22-slim for workerd compatibility ([95ecbf2](https://github.com/awaitstep/awaitstep/commit/95ecbf276c51bce80b8c09fd8d9d4512ff2475d8))
- uninstall UI bug, brand icons, remove local resend node ([#57](https://github.com/awaitstep/awaitstep/issues/57)) ([5529186](https://github.com/awaitstep/awaitstep/commit/55291868b4c08640304615fe34ddb6fa9f3cff08))
- use loader instead of beforeLoad for local dev flag ([09bd3a1](https://github.com/awaitstep/awaitstep/commit/09bd3a1524395fe587a3a374120e9513124dbd7f))
- use relative URLs for auth client in Docker builds ([3e71140](https://github.com/awaitstep/awaitstep/commit/3e7114032f4128ccb523dd435f394c6d168e2120))
- use valid category values in node definitions ([#62](https://github.com/awaitstep/awaitstep/issues/62)) ([5a5f1b0](https://github.com/awaitstep/awaitstep/commit/5a5f1b08219dfc5926e32382fd361d2de5442ab7))
- **web:** add back navigation arrow to workflow detail layout ([c8dd84e](https://github.com/awaitstep/awaitstep/commit/c8dd84eff56697a1f185491385334539f48107c0))
- **web:** add label editing for branch conditions ([357698a](https://github.com/awaitstep/awaitstep/commit/357698a2f112cdc82bef8da4028241038e0e308e))
- **web:** defer CodeEditor mount in settings to prevent flash ([725249a](https://github.com/awaitstep/awaitstep/commit/725249a82f0a988d7ec0d0769aa0e2ca3de5b3f3))
- **web:** eagerly import WorkflowSettings to eliminate toggle flash ([1371c00](https://github.com/awaitstep/awaitstep/commit/1371c00f6c0170c4c9c0e6df757b3a3f17e409d2))
- **web:** isolate trigger code editor into lazy-loaded component ([08a8b86](https://github.com/awaitstep/awaitstep/commit/08a8b8673f0c2367aa8fbba716dec5d21d7d25b6))
- **web:** lazy-load code editor in workflow settings to prevent flash ([83dada2](https://github.com/awaitstep/awaitstep/commit/83dada254f8d8be7af97c9dace2f71d7b3719b7f))
- **web:** lazy-load WorkflowSettings to prevent flash on toggle ([6d67b92](https://github.com/awaitstep/awaitstep/commit/6d67b9286f884a8a89f813cec5729baac97ce266))
- **web:** make Workflows breadcrumb clickable and show workflow ID ([d948d14](https://github.com/awaitstep/awaitstep/commit/d948d140f34af941a895ff2697d3f79b1506d655))
- **web:** move back link to content area matching run detail style ([0653321](https://github.com/awaitstep/awaitstep/commit/065332191784e34c1d026aff22653c8ebb052f38))
- **web:** point Workflows breadcrumb to /workflows ([eb2d035](https://github.com/awaitstep/awaitstep/commit/eb2d03546eac7492c52b43047f681622178b83f7))
- **web:** replace CodeEditor with textarea for trigger code ([815f4d1](https://github.com/awaitstep/awaitstep/commit/815f4d14ee17113f06fcb2480554c8eeba55a1e3))
- **web:** reset only non-canvas state when switching workflows ([b138582](https://github.com/awaitstep/awaitstep/commit/b13858240e532f6ec27047af666b52b095f1d4d4))
- **web:** reset workflow state when switching between workflows ([d55ee6e](https://github.com/awaitstep/awaitstep/commit/d55ee6e29d3ca95df209b8b98007e17ce22ff2d6))
- **web:** use breadcrumb nav for workflow detail pages ([b108100](https://github.com/awaitstep/awaitstep/commit/b1081005d69a84404134c3b620ff25a373d99d40))
- **web:** use breadcrumb nav on run detail page ([b917239](https://github.com/awaitstep/awaitstep/commit/b9172392deb3b9e7e701a3a35b2f0e2db1a13c75))
- **web:** use CSS truncate for workflow ID breadcrumb ([6325ebf](https://github.com/awaitstep/awaitstep/commit/6325ebf63926917d80c0a65a789d36c6b83ad634))
- **web:** use eager CodeEditor import in workflow settings ([74297cd](https://github.com/awaitstep/awaitstep/commit/74297cd72ddc9ff6dc579e77ee019566b5755158))
- **web:** use router.history.back() and place back link above tabs ([857b2c1](https://github.com/awaitstep/awaitstep/commit/857b2c1da13a36d41026649a386601ef0a36b4f8))

### Refactoring

- class-based codegen for custom nodes + docs ([#70](https://github.com/awaitstep/awaitstep/issues/70)) ([994cbbc](https://github.com/awaitstep/awaitstep/commit/994cbbc543207ead5b4738acb30f82dea790bf16))
- data flow architecture, dashboard split, and cleanup ([4daa79c](https://github.com/awaitstep/awaitstep/commit/4daa79c8186086e1d134615744fbfbbd24a5cc40))
- decompose page components into sub-components ([3c5c364](https://github.com/awaitstep/awaitstep/commit/3c5c36488ca45fbab5521622534260c7deaa0272))
- drop generatedCode from workflow_versions ([c83d819](https://github.com/awaitstep/awaitstep/commit/c83d8198a2fe629cff118e2b0691841b8c9b519a))
- extract canvas route logic into hooks and utils ([fdcfb47](https://github.com/awaitstep/awaitstep/commit/fdcfb47ad726a6d60772ec6896c514edee75e766))
- extract deploy dialog into hook, util, and sub-views ([9832375](https://github.com/awaitstep/awaitstep/commit/9832375b9daf3f4aae18aa529998db31a4361e18))
- extract static wrangler base config from dynamic generation ([2a8a4ef](https://github.com/awaitstep/awaitstep/commit/2a8a4ef7176e6e4d475edf0ac9a1ddd863aa4e29))
- extract workflow hydration and derivation functions ([f75735a](https://github.com/awaitstep/awaitstep/commit/f75735ab8abe4513faec3bba531996d71fdfbcc8))
- extract workflow save/deploy logic into hook ([06fffa8](https://github.com/awaitstep/awaitstep/commit/06fffa8543516ae1eef18d561fb09549cf6e18bb))
- make worker package name configurable via APP_NAME env var ([cb6ca5b](https://github.com/awaitstep/awaitstep/commit/cb6ca5be1646d76fcdecfc2c58b160f281b280ce))
- migrate useBlocker to non-deprecated API ([5365d05](https://github.com/awaitstep/awaitstep/commit/5365d05ef60789a14684a93c241e2ecc7b9cf4e0))
- remove self-hosted Cloudflare connection flow ([6c0bb86](https://github.com/awaitstep/awaitstep/commit/6c0bb86ca1c026fc0a3117a64bdc06a41290db15))
- service-level nodes, tests, and production fixes ([#61](https://github.com/awaitstep/awaitstep/issues/61)) ([ac18481](https://github.com/awaitstep/awaitstep/commit/ac18481161c49ac864f412992652421714ed6106))
- slim down canvas route to thin orchestrator ([993a283](https://github.com/awaitstep/awaitstep/commit/993a2830d9cf9757667ccf0c120fa6ec2278349d))
- split canvas route into sub-components ([ad5bf4c](https://github.com/awaitstep/awaitstep/commit/ad5bf4cf780d8c4ad1c3be47e57be14e13d3167b))
- standardize Zustand store access patterns ([8006f46](https://github.com/awaitstep/awaitstep/commit/8006f467b0e611ecf37e8429be7f46b8f607d46b))
- stateless local dev with shared workflow preparation ([a762713](https://github.com/awaitstep/awaitstep/commit/a7627136afb89c595bafb026de3eb061d9a066e3))
- unified node model — all nodes follow NodeDefinition spec ([41bcd17](https://github.com/awaitstep/awaitstep/commit/41bcd179bc435182508837bfe6f77b3f831b98fe))
- use npx wrangler instead of resolving wrangler binary ([2fa554d](https://github.com/awaitstep/awaitstep/commit/2fa554d98df8cdb466ddd3ed640583a43a270215))
- **web:** move Entry button from toolbar to code preview header ([7dc7a3e](https://github.com/awaitstep/awaitstep/commit/7dc7a3eb746a1f1375f9842bfb9de8bbdad5ab6c))
- **web:** simplify local dev hook and remove unused UI elements ([100cd38](https://github.com/awaitstep/awaitstep/commit/100cd381be8941640f3bca4c91f0a8c7ec3e1d43))

### Performance

- replace vite-tsconfig-paths plugin with native resolve.tsconfigPaths ([1a0bec5](https://github.com/awaitstep/awaitstep/commit/1a0bec5490dc566cab4621c0eae0d4d97b2c0341))
- replace vite-tsconfig-paths with native Vite 8 resolution ([06b3d11](https://github.com/awaitstep/awaitstep/commit/06b3d117c3e1024749ff5dd9db05f78bdf7ab9fc))

### Documentation

- add Claude Code project rules ([99ee603](https://github.com/awaitstep/awaitstep/commit/99ee603c0a12eaa89e7dcf4d0f82659e0dd97729))
- add phase 1 implementation plan ([2603c97](https://github.com/awaitstep/awaitstep/commit/2603c97bedf4456fce251855cf96f87ae0643b39))
- update architecture, add custom nodes and compilation docs ([ecaf180](https://github.com/awaitstep/awaitstep/commit/ecaf18023695617ba2f4fb83053783c558dc25b8))
- update architecture, READMEs, and changelog for recent features ([8e6def7](https://github.com/awaitstep/awaitstep/commit/8e6def76e53dadb251f47ba12c9358e069c18531))

## [1.0.1-beta.1](https://github.com/awaitstep/awaitstep/compare/v1.0.0-beta.1...v1.0.1-beta.1) (2026-04-01)

### Features

- **account:** conditionally render connected accounts based on enabled OAuth providers ([9124d8e](https://github.com/awaitstep/awaitstep/commit/9124d8ea829200cdba2acfc9d93261715672e87b))
- add 28 new registry nodes + audit fixes across all 44 nodes ([890dbc1](https://github.com/awaitstep/awaitstep/commit/890dbc1bc066761b4f170e495b1c33e6e4025473))
- add mailgun_send_email node to registry ([#59](https://github.com/awaitstep/awaitstep/issues/59)) ([6994ff8](https://github.com/awaitstep/awaitstep/commit/6994ff82bb5af6429919c679ee87350fe454ad3e))
- add request logger, fix session rate limiting, and 404 page ([a136c7d](https://github.com/awaitstep/awaitstep/commit/a136c7dacb012662ad159c3448e9157429ad91d9))
- API key management UI and database migration ([f012f63](https://github.com/awaitstep/awaitstep/commit/f012f63d264c82776bd1aaa21e57be5a663f4610))
- API playground and endpoint documentation ([d30b531](https://github.com/awaitstep/awaitstep/commit/d30b531f582f961f207bd9f782e38b5363d4bf1f))
- **api:** API security hardening and structured logging ([f5d07a1](https://github.com/awaitstep/awaitstep/commit/f5d07a144e1aa0e004a9cf8aabad6735f1e0b3f3))
- **auth:** enable user deletion and conditional magic link plugin ([4db04ca](https://github.com/awaitstep/awaitstep/commit/4db04cab27ca2375eab66e87699e0d328e077efc))
- build-time node registry with API endpoints ([0f7c75e](https://github.com/awaitstep/awaitstep/commit/0f7c75e5a392a2245e94de34c0a446089c009c19))
- custom node improvements (deps, codegen, defaults, icons) ([4d820e2](https://github.com/awaitstep/awaitstep/commit/4d820e230385702eedb83f1a7f641093a73fbbdc))
- custom node template compilation for codegen ([3a5e4a2](https://github.com/awaitstep/awaitstep/commit/3a5e4a230ab1fa1f11b936d23736ae2211ed9aea))
- custom nodes IR foundation and dispatch hardening ([7e3bf88](https://github.com/awaitstep/awaitstep/commit/7e3bf88aaac11e851cf13d537a067cfe6c353645))
- custom nodes Phase 2 — registry-driven palette and schema-driven config ([07351b9](https://github.com/awaitstep/awaitstep/commit/07351b991a4c6beda51e5484d03caa743afacc3c))
- debounce config panel input onChange handlers ([ac1193a](https://github.com/awaitstep/awaitstep/commit/ac1193a4c764cbe9228aeee4d220413b4eae6a81))
- editable trigger code in workflow settings ([af65a3c](https://github.com/awaitstep/awaitstep/commit/af65a3c86dd12a7aa7381c781aa61515fd5d830b))
- environment variable management + missing node detection ([0d23ea9](https://github.com/awaitstep/awaitstep/commit/0d23ea9fbecffeedaff9357c71efdd223652928e))
- frontend org/project context, switcher, and setup ([1329997](https://github.com/awaitstep/awaitstep/commit/1329997d3d5647da75e1f291ae070df4b9c55315))
- local workflow testing with wrangler dev ([23d6c74](https://github.com/awaitstep/awaitstep/commit/23d6c7421709bd00c49ad3857dd341c3bb293855))
- node-author agent, /create-node skill, and authoring guide ([bde988b](https://github.com/awaitstep/awaitstep/commit/bde988b06fa0d943ebdcdfdb54a2953618a6ba62))
- node-cli with generate command and example node ([c451dc1](https://github.com/awaitstep/awaitstep/commit/c451dc1b85ec7077bf22feac6e3f20cd5ba617be))
- npm dependency support for workflows ([a532679](https://github.com/awaitstep/awaitstep/commit/a5326795bf216b7fedba51bbe29303b8b0e5e845))
- organizations and projects ownership model ([a00b23b](https://github.com/awaitstep/awaitstep/commit/a00b23b2fe2ab0d9844065719adec87fa1e90312))
- persist workflow env vars to DB and load on open ([3e043be](https://github.com/awaitstep/awaitstep/commit/3e043be7661516bc40aa7309f16aab561dace990))
- Phase 1 audit gap implementations ([afefb20](https://github.com/awaitstep/awaitstep/commit/afefb20811a7eb9d6eb6e04ac8f5936b1ec721a4))
- preview mode for codegen hides node class implementations ([a5fa0e8](https://github.com/awaitstep/awaitstep/commit/a5fa0e89ce6cb44a5cc5d089b3f027d053542f50))
- preview mode for codegen hides node class implementations ([09388ae](https://github.com/awaitstep/awaitstep/commit/09388ae0a84d36c584895dd210f82675752fee92))
- preview mode for codegen hides node class implementations ([8eb883f](https://github.com/awaitstep/awaitstep/commit/8eb883f4d68ae2e19a0f4f9af81176f3334d4876))
- preview mode for codegen hides node class implementations ([3a89b7a](https://github.com/awaitstep/awaitstep/commit/3a89b7a9f3c9bb419af29b43fed35c293cb16d0b))
- preview mode for codegen hides node class implementations ([890dbc1](https://github.com/awaitstep/awaitstep/commit/890dbc1bc066761b4f170e495b1c33e6e4025473))
- redesign homepage with handwritten hero and feature grid ([c4623ca](https://github.com/awaitstep/awaitstep/commit/c4623ca1a9ece74573fb94d0d8dd941caff449be))
- remote node registry with marketplace ([0c7e438](https://github.com/awaitstep/awaitstep/commit/0c7e4384afa9c408c4d5cdc19a5df627bf93e4d2))
- settings, security, onboarding, and code quality improvements ([58e255b](https://github.com/awaitstep/awaitstep/commit/58e255bb0ee177b8a4325dce3353342527b79254))
- smart install script with auto Caddy setup ([e24fe19](https://github.com/awaitstep/awaitstep/commit/e24fe19f69caa9d6048a01b2e4efcb7d47d358cf))
- visual canvas and deployment v0.0.1 ([4bb54fb](https://github.com/awaitstep/awaitstep/commit/4bb54fb16861fb4cd67a7880abcb84ac5b85b06b))
- **web:** breadcrumb navigation and card list redesign ([2028f70](https://github.com/awaitstep/awaitstep/commit/2028f70b58fab1b8d9e1f3ea45738cd6c0fb156d))
- **web:** move trigger code editor to its own overlay dialog ([e5c1e6f](https://github.com/awaitstep/awaitstep/commit/e5c1e6fb807eac6b4dac30af6ad670d4e34dd21c))
- workflow versioning suite ([69b0582](https://github.com/awaitstep/awaitstep/commit/69b0582d2853fcfa30bd3947800b071c5aedb47a))

### Bug Fixes

- add packages:write permission to release workflow ([f1e1477](https://github.com/awaitstep/awaitstep/commit/f1e1477cde10c4eaf692c0d6f0d9e312875577dd))
- API security hardening and dependency patches ([494ce27](https://github.com/awaitstep/awaitstep/commit/494ce2761ff7609ac9428bb0fd6c88dcbc5554ed))
- **api:** sanitize workflow name in CF API calls for run operations ([18e3ee7](https://github.com/awaitstep/awaitstep/commit/18e3ee7afb6395ecd71e4007f1093071c85fc027))
- checksum mismatch in registry client ([#56](https://github.com/awaitstep/awaitstep/issues/56)) ([005d69d](https://github.com/awaitstep/awaitstep/commit/005d69d6165b79bf43d54bc75037e43647fe3307))
- CI workflow formatting and bug fixes ([#58](https://github.com/awaitstep/awaitstep/issues/58)) ([e213d54](https://github.com/awaitstep/awaitstep/commit/e213d547f3a0e2a848b52848d85c14f820467ca7))
- **cloudflare:** bind wrangler dev to 0.0.0.0 and remove global install ([0c49490](https://github.com/awaitstep/awaitstep/commit/0c49490788002f1fc961a6f12623f206e8c2e369))
- **codegen:** rewrite env. to this.env. inside workflow run() body ([9a01371](https://github.com/awaitstep/awaitstep/commit/9a013713855c28af7c4d3fa24e0aeaecc27dcdc2))
- commit registry index.json and upgrade CI to Node 22 ([699cfa4](https://github.com/awaitstep/awaitstep/commit/699cfa451864486e89bec394d76d43f0ec1d77fd))
- **deploy:** use wrangler secret put for secrets instead of .env file ([19bf1f0](https://github.com/awaitstep/awaitstep/commit/19bf1f057554766362b0911212d3a46e3f5606ce))
- **deploy:** write .env file for wrangler and separate secrets from vars ([4b8f374](https://github.com/awaitstep/awaitstep/commit/4b8f374c83687bd7ae5424c5cda847956bb01e5c))
- dismissable org/project dialogs with centralized guards ([0b0d0a9](https://github.com/awaitstep/awaitstep/commit/0b0d0a902801de8c5fc3bb1bdf335158edabffda))
- enable local dev routes in all environments ([bd3ff52](https://github.com/awaitstep/awaitstep/commit/bd3ff5269aab814f99f01c2cee4468638bb22823))
- enable local dev routes in all environments ([eccc273](https://github.com/awaitstep/awaitstep/commit/eccc2738554be20fba159646d8ec7989cedee39a))
- improve install.sh with interactive prompts for all config ([769d9f2](https://github.com/awaitstep/awaitstep/commit/769d9f25ff4fe02fd61de67b53a802c227e78169))
- install wrangler in Docker image for local dev support ([6b0b43f](https://github.com/awaitstep/awaitstep/commit/6b0b43f02ce5618bd61417e472adc226c15d4444))
- install wrangler in Docker image for local dev support ([5d3250e](https://github.com/awaitstep/awaitstep/commit/5d3250ed6e66453c59efb1942a39a14cab189aee))
- local dev cleanup, ENABLE_LOCAL_DEV gate, clipboard fallback ([e40d31d](https://github.com/awaitstep/awaitstep/commit/e40d31dce17862eac39fa123c2d66d9bb02ae116))
- **org-dialog:** set active organization after creation for new users ([7d2dd82](https://github.com/awaitstep/awaitstep/commit/7d2dd822c35f0d27dc1a22180ff280fd8b3001b9))
- qualify outer table column in correlated subqueries ([d837554](https://github.com/awaitstep/awaitstep/commit/d8375542506bbb35d328869e4f70fe46a214e2ca))
- resolve Dependabot security alerts for picomatch, srvx, undici ([6e871ef](https://github.com/awaitstep/awaitstep/commit/6e871effff7426ac414b24065b4bf4dd4e0ef164))
- resolve merge conflicts from main, restore dev versions ([33b1b8c](https://github.com/awaitstep/awaitstep/commit/33b1b8cb16ed287d77fb67db6efe4eb5459ba63f))
- security cleanup and persist trigger code to DB ([59700f7](https://github.com/awaitstep/awaitstep/commit/59700f70a0aaefc621cc912d8771d8abce2d1eca))
- silence zustand persist SSR warnings with createJSONStorage ([b56efa8](https://github.com/awaitstep/awaitstep/commit/b56efa83a47cca136d652148a448065eb101d4e6))
- SSR server config falls back to PORT env for Docker ([95ac6bb](https://github.com/awaitstep/awaitstep/commit/95ac6bb9b4c23cb500847a48fafd36b8918c634a))
- switch Docker base to node:22-slim for workerd compatibility ([95ecbf2](https://github.com/awaitstep/awaitstep/commit/95ecbf276c51bce80b8c09fd8d9d4512ff2475d8))
- uninstall UI bug, brand icons, remove local resend node ([#57](https://github.com/awaitstep/awaitstep/issues/57)) ([5529186](https://github.com/awaitstep/awaitstep/commit/55291868b4c08640304615fe34ddb6fa9f3cff08))
- use loader instead of beforeLoad for local dev flag ([09bd3a1](https://github.com/awaitstep/awaitstep/commit/09bd3a1524395fe587a3a374120e9513124dbd7f))
- use relative URLs for auth client in Docker builds ([3e71140](https://github.com/awaitstep/awaitstep/commit/3e7114032f4128ccb523dd435f394c6d168e2120))
- use valid category values in node definitions ([#62](https://github.com/awaitstep/awaitstep/issues/62)) ([5a5f1b0](https://github.com/awaitstep/awaitstep/commit/5a5f1b08219dfc5926e32382fd361d2de5442ab7))
- **web:** add back navigation arrow to workflow detail layout ([c8dd84e](https://github.com/awaitstep/awaitstep/commit/c8dd84eff56697a1f185491385334539f48107c0))
- **web:** add label editing for branch conditions ([357698a](https://github.com/awaitstep/awaitstep/commit/357698a2f112cdc82bef8da4028241038e0e308e))
- **web:** defer CodeEditor mount in settings to prevent flash ([725249a](https://github.com/awaitstep/awaitstep/commit/725249a82f0a988d7ec0d0769aa0e2ca3de5b3f3))
- **web:** eagerly import WorkflowSettings to eliminate toggle flash ([1371c00](https://github.com/awaitstep/awaitstep/commit/1371c00f6c0170c4c9c0e6df757b3a3f17e409d2))
- **web:** isolate trigger code editor into lazy-loaded component ([08a8b86](https://github.com/awaitstep/awaitstep/commit/08a8b8673f0c2367aa8fbba716dec5d21d7d25b6))
- **web:** lazy-load code editor in workflow settings to prevent flash ([83dada2](https://github.com/awaitstep/awaitstep/commit/83dada254f8d8be7af97c9dace2f71d7b3719b7f))
- **web:** lazy-load WorkflowSettings to prevent flash on toggle ([6d67b92](https://github.com/awaitstep/awaitstep/commit/6d67b9286f884a8a89f813cec5729baac97ce266))
- **web:** make Workflows breadcrumb clickable and show workflow ID ([d948d14](https://github.com/awaitstep/awaitstep/commit/d948d140f34af941a895ff2697d3f79b1506d655))
- **web:** move back link to content area matching run detail style ([0653321](https://github.com/awaitstep/awaitstep/commit/065332191784e34c1d026aff22653c8ebb052f38))
- **web:** point Workflows breadcrumb to /workflows ([eb2d035](https://github.com/awaitstep/awaitstep/commit/eb2d03546eac7492c52b43047f681622178b83f7))
- **web:** replace CodeEditor with textarea for trigger code ([815f4d1](https://github.com/awaitstep/awaitstep/commit/815f4d14ee17113f06fcb2480554c8eeba55a1e3))
- **web:** reset only non-canvas state when switching workflows ([b138582](https://github.com/awaitstep/awaitstep/commit/b13858240e532f6ec27047af666b52b095f1d4d4))
- **web:** reset workflow state when switching between workflows ([d55ee6e](https://github.com/awaitstep/awaitstep/commit/d55ee6e29d3ca95df209b8b98007e17ce22ff2d6))
- **web:** use breadcrumb nav for workflow detail pages ([b108100](https://github.com/awaitstep/awaitstep/commit/b1081005d69a84404134c3b620ff25a373d99d40))
- **web:** use breadcrumb nav on run detail page ([b917239](https://github.com/awaitstep/awaitstep/commit/b9172392deb3b9e7e701a3a35b2f0e2db1a13c75))
- **web:** use CSS truncate for workflow ID breadcrumb ([6325ebf](https://github.com/awaitstep/awaitstep/commit/6325ebf63926917d80c0a65a789d36c6b83ad634))
- **web:** use eager CodeEditor import in workflow settings ([74297cd](https://github.com/awaitstep/awaitstep/commit/74297cd72ddc9ff6dc579e77ee019566b5755158))
- **web:** use router.history.back() and place back link above tabs ([857b2c1](https://github.com/awaitstep/awaitstep/commit/857b2c1da13a36d41026649a386601ef0a36b4f8))

### Refactoring

- class-based codegen for custom nodes + docs ([#70](https://github.com/awaitstep/awaitstep/issues/70)) ([994cbbc](https://github.com/awaitstep/awaitstep/commit/994cbbc543207ead5b4738acb30f82dea790bf16))
- data flow architecture, dashboard split, and cleanup ([4daa79c](https://github.com/awaitstep/awaitstep/commit/4daa79c8186086e1d134615744fbfbbd24a5cc40))
- decompose page components into sub-components ([3c5c364](https://github.com/awaitstep/awaitstep/commit/3c5c36488ca45fbab5521622534260c7deaa0272))
- drop generatedCode from workflow_versions ([c83d819](https://github.com/awaitstep/awaitstep/commit/c83d8198a2fe629cff118e2b0691841b8c9b519a))
- extract canvas route logic into hooks and utils ([fdcfb47](https://github.com/awaitstep/awaitstep/commit/fdcfb47ad726a6d60772ec6896c514edee75e766))
- extract deploy dialog into hook, util, and sub-views ([9832375](https://github.com/awaitstep/awaitstep/commit/9832375b9daf3f4aae18aa529998db31a4361e18))
- extract static wrangler base config from dynamic generation ([2a8a4ef](https://github.com/awaitstep/awaitstep/commit/2a8a4ef7176e6e4d475edf0ac9a1ddd863aa4e29))
- extract workflow hydration and derivation functions ([f75735a](https://github.com/awaitstep/awaitstep/commit/f75735ab8abe4513faec3bba531996d71fdfbcc8))
- extract workflow save/deploy logic into hook ([06fffa8](https://github.com/awaitstep/awaitstep/commit/06fffa8543516ae1eef18d561fb09549cf6e18bb))
- make worker package name configurable via APP_NAME env var ([cb6ca5b](https://github.com/awaitstep/awaitstep/commit/cb6ca5be1646d76fcdecfc2c58b160f281b280ce))
- migrate useBlocker to non-deprecated API ([5365d05](https://github.com/awaitstep/awaitstep/commit/5365d05ef60789a14684a93c241e2ecc7b9cf4e0))
- remove self-hosted Cloudflare connection flow ([6c0bb86](https://github.com/awaitstep/awaitstep/commit/6c0bb86ca1c026fc0a3117a64bdc06a41290db15))
- service-level nodes, tests, and production fixes ([#61](https://github.com/awaitstep/awaitstep/issues/61)) ([ac18481](https://github.com/awaitstep/awaitstep/commit/ac18481161c49ac864f412992652421714ed6106))
- slim down canvas route to thin orchestrator ([993a283](https://github.com/awaitstep/awaitstep/commit/993a2830d9cf9757667ccf0c120fa6ec2278349d))
- split canvas route into sub-components ([ad5bf4c](https://github.com/awaitstep/awaitstep/commit/ad5bf4cf780d8c4ad1c3be47e57be14e13d3167b))
- standardize Zustand store access patterns ([8006f46](https://github.com/awaitstep/awaitstep/commit/8006f467b0e611ecf37e8429be7f46b8f607d46b))
- stateless local dev with shared workflow preparation ([a762713](https://github.com/awaitstep/awaitstep/commit/a7627136afb89c595bafb026de3eb061d9a066e3))
- unified node model — all nodes follow NodeDefinition spec ([41bcd17](https://github.com/awaitstep/awaitstep/commit/41bcd179bc435182508837bfe6f77b3f831b98fe))
- use npx wrangler instead of resolving wrangler binary ([2fa554d](https://github.com/awaitstep/awaitstep/commit/2fa554d98df8cdb466ddd3ed640583a43a270215))
- **web:** move Entry button from toolbar to code preview header ([7dc7a3e](https://github.com/awaitstep/awaitstep/commit/7dc7a3eb746a1f1375f9842bfb9de8bbdad5ab6c))
- **web:** simplify local dev hook and remove unused UI elements ([100cd38](https://github.com/awaitstep/awaitstep/commit/100cd381be8941640f3bca4c91f0a8c7ec3e1d43))

### Documentation

- add Claude Code project rules ([99ee603](https://github.com/awaitstep/awaitstep/commit/99ee603c0a12eaa89e7dcf4d0f82659e0dd97729))
- add phase 1 implementation plan ([2603c97](https://github.com/awaitstep/awaitstep/commit/2603c97bedf4456fce251855cf96f87ae0643b39))
- update architecture, add custom nodes and compilation docs ([ecaf180](https://github.com/awaitstep/awaitstep/commit/ecaf18023695617ba2f4fb83053783c558dc25b8))
- update architecture, READMEs, and changelog for recent features ([8e6def7](https://github.com/awaitstep/awaitstep/commit/8e6def76e53dadb251f47ba12c9358e069c18531))

## [1.0.4-beta.1](https://github.com/awaitstep/awaitstep/compare/v1.0.3-beta.1...v1.0.4-beta.1) (2026-04-01)

### Bug Fixes

- install wrangler in Docker image for local dev support ([6b0b43f](https://github.com/awaitstep/awaitstep/commit/6b0b43f02ce5618bd61417e472adc226c15d4444))

## [1.0.3-beta.1](https://github.com/awaitstep/awaitstep/compare/v1.0.2-beta.1...v1.0.3-beta.1) (2026-04-01)

### Bug Fixes

- enable local dev routes in all environments ([bd3ff52](https://github.com/awaitstep/awaitstep/commit/bd3ff5269aab814f99f01c2cee4468638bb22823))

## [1.0.2-beta.1](https://github.com/awaitstep/awaitstep/compare/v1.0.1-beta.1...v1.0.2-beta.1) (2026-03-31)

### Bug Fixes

- SSR server config falls back to PORT env for Docker ([95ac6bb](https://github.com/awaitstep/awaitstep/commit/95ac6bb9b4c23cb500847a48fafd36b8918c634a))

## [1.0.1-beta.1](https://github.com/awaitstep/awaitstep/compare/v1.0.0-beta.1...v1.0.1-beta.1) (2026-03-31)

### Bug Fixes

- add packages:write permission to release workflow ([f1e1477](https://github.com/awaitstep/awaitstep/commit/f1e1477cde10c4eaf692c0d6f0d9e312875577dd))
- improve install.sh with interactive prompts for all config ([769d9f2](https://github.com/awaitstep/awaitstep/commit/769d9f25ff4fe02fd61de67b53a802c227e78169))
- use relative URLs for auth client in Docker builds ([3e71140](https://github.com/awaitstep/awaitstep/commit/3e7114032f4128ccb523dd435f394c6d168e2120))

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
