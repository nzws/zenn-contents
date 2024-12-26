<!-- textlint-disable ja-technical-writing/no-mix-dearu-desumasu -->

# @nzws/zenn-contents

@nzws の Zenn にデプロイしているコンテンツ集です： https://zenn.dev/nzws

## How to contribute

誤字や間違いがあればお手数ですが Contribute 頂けると非常に助かります :pray:

### Requirements

- Node.js

### Install

- 初期化すると [husky](https://typicode.github.io/husky/) が有効になります。
  - husky では pre-commit で `yarn lint` を実行しています。

```bash
yarn
```

### Preview

- [Zenn CLI](https://zenn.dev/zenn/articles/zenn-cli-guide) のプレビューサーバーを起動します。

```bash
yarn dev
```

### Lint

- [Prettier](https://prettier.io/) と [textlint](https://github.com/textlint/textlint) で記事のフォーマットや日本語の記法を揃えています。

```bash
yarn lint
```
