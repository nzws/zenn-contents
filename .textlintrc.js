/**
 * TextLint Rules
 * ref: https://github.com/gatsbyjs/gatsby-ja/blob/master/.textlintrc.js
 * ref: https://github.com/kufu/textlint-rule-preset-smarthr/blob/main/src/index.ts
 */

module.exports = {
  rules: {
    // https://github.com/textlint-ja/textlint-rule-preset-ja-technical-writing
    "preset-ja-technical-writing": {
      "no-exclamation-question-mark": false, // 感嘆符と疑問符の使用を許可
      "max-ten": { max: 5 }, // 句点の数を緩和
      "ja-no-weak-phrase": false, // 弱い表現の許容
      "ja-no-mixed-period": false, // 文末の記号の混在を許容
      "sentence-length": { max: 150 }, // 文の長さを緩和
    },

    // https://github.com/textlint-ja/textlint-rule-preset-JTF-style
    "preset-jtf-style": {
      "1.1.3.箇条書き": false, // 箇条書きの文末に句点(。)以外を許可
      "3.1.1.全角文字と半角文字の間": false, // 全角文字と半角文字の間にスペースを入れる
      "2.1.6.カタカナの長音": true, // カタカナ語の長音は基本的に伸ばす
      "2.2.1.ひらがなと漢字の使い分け": true, // ひらがなにしたほうが良い漢字
      "4.3.2.大かっこ［］": false, // Markdown 記法に引っかかるので無効化
    },

    // https://github.com/textlint-ja/textlint-rule-preset-ja-spacing
    "preset-ja-spacing": {
      "ja-space-between-half-and-full-width": {
        space: ["alphabets", "numbers"],
      },
    },

    // https://github.com/textlint-rule/textlint-rule-prh
    prh: { rulePaths: ["./dict/main.yml"] },

    "ja-hiragana-hojodoushi": true, // ひらがなにしたほうが良い補助動詞
    "ja-hiragana-fukushi": true, // ひらがなにしたほうが良い副詞
  },
  filters: {
    // https://github.com/textlint/textlint-filter-rule-comments
    comments: true,
  },
};
