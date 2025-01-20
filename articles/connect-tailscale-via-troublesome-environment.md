---
title: "厄介な環境から Tailscale に接続する (プロキシなど)"
emoji: "😖"
type: "tech"
topics:
  - tailscale
  - vpn
  - proxy
published: true
---

<!-- textlint-disable ja-technical-writing/sentence-length -->

どうもこんにちは、@nzws です。メッシュ VPN サービスである[Tailscale](https://tailscale.com) は非常に使いやすく、
大抵どんな環境であってもインターネットに繋がっていれば `curl -fsSL https://tailscale.com/install.sh | sh` (Linux)[^1] を叩いてログインするだけで
VPN ネットワークに参加させられる優れものです。しかし少々厄介な環境で Tailscale を使用する上で遭遇した事象があったため、いくつかご紹介します。

# プロキシ経由で接続する (Linux)

プロキシが必須なネットワークでは Tailscale の制御サーバーや DERP サーバーと接続するためにもプロキシが必要となりそのままではマシンが接続できないため、
Tailscaled デーモンに環境変数を設定してプロキシを構成する必要があります。

Linux（Debian 系）では `/etc/default/tailscaled` にプロキシの環境変数を設定する事で、
Tailscaled デーモンにプロキシを経由させて接続するようにできます。[^2]

```
$ sudo vi /etc/default/tailscaled

# 略
HTTPS_PROXY="http://example.com:8080"
HTTP_PROXY="http://example.com:8080"
```

ファイルを編集した後に `sudo systemctl restart tailscaled` を実行して Tailscaled デーモンを再起動すると、
プロキシを経由して各種サービスへ接続するようになります。

# DERP (リレー)サーバーのリージョンを固定する

[DERP](https://tailscale.com/kb/1232/derp-servers) は Tailscale の機能の 1 つで、マシン同士がファイヤーウォールなどにより P2P で直接接続できなくても Tailscale が管理するサーバーを経由して暗号化されたパケットをやり取りすることで通信が可能となります。

DERP を使用する際は 2 マシンと DERP サーバー間の距離が遅延に大きく関わるため、なるべく近い DERP サーバーと接続する必要があります。
Tailscale では記事執筆時点で 27 リージョン[^3]展開されていますが、厄介な環境では何故か遠くの DERP サーバーが選定されて 2 マシン間の ping が凄い事になるケースがあるため固定します。
現時点で日本には東京リージョンしかないため、日本にあるマシンであれば東京リージョンに固定すれば問題無いと思います。

DERP サーバーに関する設定は Tailnet（組織）単位で [ACL](https://tailscale.com/kb/1337/acl-syntax) を編集する必要があるため、Tailnet 管理者の権限が必要です。

現在マシンが使用する DERP サーバーは [Admin Console](https://login.tailscale.com) から確認するか、`tailscale netcheck` コマンドを実行して確認できます。

```
$ tailscale netcheck

Report:
        * UDP: true
        * IPv4: yes, 略:50523
        * IPv6: yes, [略]:60662
        * MappingVariesByDestIP: false
        * PortMapping: UPnP
        * CaptivePortal: false
        * Nearest DERP: Tokyo
        * DERP latency:
                - tok: 37.4ms  (Tokyo)
                - hkg: 78.6ms  (Hong Kong)
```

ただし、厄介な環境だとこれらの値すら正常に表示されない事があるので、直接接続できないマシンへ `tailscale ping` コマンドを叩くことでも使用した DERP サーバーを確認できます。

```
$ tailscale ping hoge.example.ts.net

pong from hoge (略) via DERP(tok) in 41ms
pong from hoge (略) via DERP(tok) in 37ms
pong from hoge (略) via DERP(tok) in 36ms
```

この DERP サーバーが日本国内にあるマシンにも関わらず Tokyo や tok 以外が出てくる場合は設定が必要です。
Admin Console 上の Access Controls タブにて ACL の編集画面を表示し、以下を追記します。[^4]

```
{
  // ...
  "derpMap": {
    "Regions": {
      "1": null, // New York
      "2": null, // San Francisco
      "3": null, // Singapore
      "4": null, // Frankfurt
      "5": null, // Sydney
      "6": null, // Bangalore
      // "7": null, // Tokyo
      "8":  null, // London
      "9":  null, // Dallas
      "10": null, // Seattle
      "11": null, // Sao Paulo
      "12": null, // Chicago
      "13": null, // Denver
      "14": null, // Amsterdam
      "15": null, // Johannesburg
      "16": null, // Miami
      "17": null, // Los Angeles
      "18": null, // Paris
      "19": null, // Madrid
      "20": null, // Hong Kong
      "21": null, // Toronto
      "22": null, // Warsaw
      "23": null, // Dubai
      "24": null, // Honolulu
      "25": null, // Nairobi
      "26": null, // Nuremberg
      "27": null, // Ashburn
    },
  },
}
```

[Tailscale が管理する DERP サーバー](https://controlplane.tailscale.com/derpmap/default)にはリージョンごとに RegionID が割り振られており、それをキーに値を null として指定すれば所属するマシンが該当リージョンを使用させないようにできます。
そのため使用したい東京リージョンのみ null を入力しなければ東京リージョンのみ使用させることが可能です。リージョンの除外はできるものの、特定リージョンのみ使用する設定は現時点ではできないようでした。

[^1]: https://tailscale.com/download

[^2]: https://github.com/tailscale/tailscale/issues/10235

[^3]: https://controlplane.tailscale.com/derpmap/default

[^4]: https://github.com/tailscale/tailscale/issues/6187
