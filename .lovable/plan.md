Gerar pacote Design System portátil em `/mnt/documents/dhl-design-system/`:

1. **README.md** — Guia completo: identidade, paleta HSL/HEX (light+dark), tipografia, spacing, radius, componentes (sidebar, cards, buttons, badges), padrões UX (multi-país, multi-idioma, theme toggle), animations, integração.
2. **tokens/design-tokens.json** — Tokens estruturados (style-dictionary friendly) com cores brand + semânticas (light/dark), radius, fonts.
3. **tokens/index.css** — Cópia limpa do `src/index.css` (CSS vars + utilities DHL).
4. **tokens/tailwind.config.snippet.ts** — Bloco `theme.extend` com colors + keyframes/animations.
5. **assets/** — Os 3 logos SVG (red, white, yellow-bg) com aviso de marca registada.
6. **INTEGRATION.md** — Guia de adoção em 4 passos.
7. **dhl-design-system.zip** — Pacote zipado para download.

Entregar via `<lov-artifact>` o ZIP final.