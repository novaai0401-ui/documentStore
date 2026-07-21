# @pdfcraft/ui-adapter-mui

Material UI binding for the `UIAdapter` contract from `@pdfcraft/ui-react`.

```bash
pnpm add @pdfcraft/ui-adapter-mui @mui/material @emotion/react @emotion/styled
```

```tsx
import { AppV2 } from '@pdfcraft/demo';   // or your own app shell
import { muiAdapter } from '@pdfcraft/ui-adapter-mui';

<AppV2 formAdapter={muiAdapter} />
```

MUI is a peer dep — install whatever major you already use (`^5`, `^6`, `^7` are all supported). No other configuration; the adapter is stateless binding glue.

## Want a different UI library?

Implement the 9-method `UIAdapter` interface yourself — see `BYO-ADAPTER.md` at the repo root.
