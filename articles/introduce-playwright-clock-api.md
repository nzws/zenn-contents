---
title: "Playwright でタイマーモックが使えるようになった"
emoji: "⏰"
type: "tech"
topics:
  - playwright
  - testing
  - e2e
  - frontend
  - typescript
published: true
published_at: 2024-06-22 13:00
---

どうもこんにちは、@nzws です。（ちょうど気になったネタを見つけたので Zenn 初投稿です）  
今回は記事執筆時点で次バージョンの Playwright v1.45 で追加される予定である Clock API についてお試ししたことを書いていきます。

https://playwright.dev/docs/next/clock

https://playwright.dev/docs/next/api/class-clock

# 背景

背景について簡単に説明すると、タイマーモックは自動テスト内で時間を操り、コード内で時間に依存するような機能を上手く短時間でテストさせるための機能です。  
ユニットテストフレームワークの Jest[^1] や Vitest[^2] は標準機能としてタイマーモックが提供されていますが、E2E テストフレームワークの Playwright ではタイマーモックが今まで機能として提供されていませんでした。

余談ですが前述の Jest や Vitest だと `setTimeout`/`setInterval` みたいなものは標準機能でモックされるものの、`Date` はモックされないため [MockDate](https://github.com/boblauer/MockDate) 等をよく使用すると思います。一方 Playwright は `Date` も含めてモックする Clock API として実装されるようです。  
また、私は使用していないためこの記事を書く際に知りましたが、先発の E2E テストフレームワークである Cypress[^3] は同様の Clock API をすでに実装しているようです。

# Clock API について

Playwright の Clock API は以下の時間に関係するクラス/関数のモックをサポートしています。[^4]

- `Date`
- `setTimeout`
- `setInterval`
- `requestAnimationFrame`
- `requestIdleCallback`
- `performance`
- （&キャンセル関数）

前述の通り `Date` もサポートしている事もあってか、API としては日時を基準に動作させるようです。後述しますが初期化周りでは基本的に日時を引数に指定して動作させます。

# Clock API をお試しする

今回は適当に時間周りの関数を一通り触るページを用意してみました。ソースコードは [nzws/playwright-clock-api-demo](https://github.com/nzws/playwright-clock-api-demo) で確認できます。
カウンターは `setInterval`、時刻表示は `requestAnimationFrame`、ログアウト（ただのタイムアウト）は `setTimeout` で動いています。

![カウンター、時刻表示、ログアウトのある適当なサンプルページ](/images/articles/introduce-playwright-clock-api/1.png)

Playwright のベータ版は以下でダウンロードできます。

```bash
yarn add --exact --dev @playwright/test@beta
```

最初にカウンターのテストを軽く書いてみます。初期化時に `2024-02-02T10:00:00` を基準に開始し、`clock.runFor` 関数で 10 秒早送りさせています。

```typescript
// (実行側から抜粋)
useEffect(() => {
  if (!enabled) {
    return;
  }

  const interval = setInterval(() => {
    setCount((prev) => prev + 1);
  }, 1000);

  return () => clearInterval(interval);
}, [enabled]);
```

```typescript
// テスト
test("カウント開始を押下して10秒後にカウントが10になる", async ({ page }) => {
  await page.clock.install({ time: new Date("2024-02-02T10:00:00") });
  await page.goto("/");

  const counter = page.getByTestId("count");
  await expect(counter).toHaveText("0");

  await page.getByRole("button", { name: "カウント開始" }).click();
  await page.clock.runFor("00:10");

  await expect(counter).toHaveText("10");
});
```

`clock.runFor` は単純に時間を早送りさせることができます。

また、他に時刻を進める関数として `clock.fastForward` があります。ログアウト処理のテストを書いてみます。

```typescript
// (実行側から抜粋)
useEffect(() => {
  const timeout = setTimeout(
    () => {
      setLoggedOut(true);
    },
    1000 * 60 * 60,
  );

  return () => clearTimeout(timeout);
}, []);
```

```typescript
// テスト
test("1時間後にログアウトする", async ({ page }) => {
  await page.clock.install({ time: new Date("2024-02-02T10:00:00") });
  await page.goto("/");

  const loggedOut = page.getByText("1時間経過したため、ログアウトしました！！");
  await expect(loggedOut).toBeHidden();

  await page.clock.fastForward("01:00:00");

  await expect(loggedOut).toBeVisible();
});
```

`clock.fastForward` では一瞬で指定時間に設定できます。

`clock.runFor` では早送りで設定するのに対して `clock.fastForward` は一瞬で設定するため fastForward の方が高速に実行できます。ただし fastForward は interval も 1 回しか発火しないため、前述のカウンターの例では正常に動作させることができません。これはドキュメントにも記載があります。[^5]

> Only fires due timers at most once. This is equivalent to user closing the laptop lid for a while and reopening it later, after given time.

単純な timeout であったり、interval 内で時刻を比較した上で動作するような実装であれば fastForward で問題ないと思われます。

まとめると以下のような挙動です。

- `clock.fastForward`
  - 時刻が一瞬で指定時間になる
  - interval や timeout は到達したものが実行される
  - ただし、interval は 1 回しか実行されない
- `clock.runFor`
  - 時刻が早送りで指定時間になる
  - interval や timeout は到達したら随時実行される
  - fastForward に比べると進み方がかなり遅いため、長時間進めるものはタイムアウトする可能性がある
    - 例えば 1 分進めると fastForward は 26ms なのに対して runFor は 14 秒かかる
    - 早送りする間隔は恐らく現状設定できない？

また、上記のテストでは時間が進む中での制御でしたが、時間を固定して確認する必要がある場合は `clock.pauseAt` や `clock.setFixedTime` が使用できます。

```typescript
test("時刻が表示される (pauseAt)", async ({ page }) => {
  await page.clock.install({ time: new Date("2024-02-02T09:00:00") });
  await page.goto("/");

  await page.clock.pauseAt(new Date("2024-02-02T10:00:00"));

  const currentDateTime = page.getByTestId("currentDateTime");
  await expect(currentDateTime).toHaveText("2024/2/2 10:00:00");

  // for testing
  await page.waitForTimeout(1000);
  await expect(currentDateTime).toHaveText("2024/2/2 10:00:00");
});

test("時刻が表示される (setFixedTime)", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2024-02-02T10:00:00"));
  await page.goto("/");

  const currentDateTime = page.getByTestId("currentDateTime");
  await expect(currentDateTime).toHaveText("2024/2/2 10:00:00");

  // for testing
  await page.waitForTimeout(1000);
  await expect(currentDateTime).toHaveText("2024/2/2 10:00:00");
});
```

<!-- textlint-disable -->

`clock.pauseAt` は `clock.fastForward` と同様 interval や timeout を 1 回動作させる一方、`clock.setFixedTime` はブラウザーの時間を固定しながらも interval や timeout については通常通り動作させたままにできるようです。
後者の使い道はいまいちよく分かりませんが、異常系のテストとかでしょうか。

<!-- textlint-enable -->

# 気になったこと

気になったこととしては、まずデフォルトの時間の進み方が挙げられます。Jest 等はモックを初期化すると時間が止まったような挙動になり、`advanceTimersByTime` などを実行すると手動で少しずつ時を進められます。
一方 Playwright では `clock.install` を実行した時、その時刻にいったんセットされてから通常通り時間が進む挙動をします。そのため、確実に時間を止めてテストを実行する場合は `clock.pauseAt` を途中で実行する必要があるかと思います。

また `clock.pauseAt` 関数についてはブラウザーで現在進んでいる時刻よりも前の時刻に設定するとエラーが投げられて続行できません。そのため `clock.install` と `clock.pauseAt` は十分余裕を空けた時刻設定をする必要があり、少し使いづらいと感じました。

```typescript
// 🙅‍♂ Error: clock.pauseAt: Error: Cannot fast-forward to the past
await page.clock.install({ time: new Date("2024-02-02T10:00:00Z") });
// ...
await page.clock.pauseAt(new Date("2024-02-02T10:00:00Z"));

// 🙆‍♂
await page.clock.install({ time: new Date("2024-02-02T09:00:00Z") });
// ...
await page.clock.pauseAt(new Date("2024-02-02T10:00:00Z"));
```

というのと、私のテスト環境では `clock.pauseAt` を使用すると後の `clock.fastForward` や `clock.runFor` で正常に時間が進まなくなるような挙動に遭遇し、単純に私の書き方が悪いのかベータ版で不安定だからなのかはよく分からずちょっと謎でした。安定版がリリースされたら再度使用してみたいと思います。

# 最後に

結構手間取ってしまいましたが、新しく実装された Clock API を簡単に触ってみました。私自身最近になって Playwright に本腰を入れて使い始めたというのもあり、Jest の調子でテストコードを書こうとすると微妙に躓くポイントが多かったため徐々に Playwright に慣れていきたいです。

[^1]: https://jestjs.io/docs/timer-mocks

[^2]: https://vitest.dev/guide/mocking.html#timers

[^3]: https://docs.cypress.io/api/commands/clock

[^4]: https://playwright.dev/docs/next/clock

[^5]: https://playwright.dev/docs/next/api/class-clock#clock-fast-forward
