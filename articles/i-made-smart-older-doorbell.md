---
title: "M5Stack と OSS を駆使して古のインターホンを無理矢理スマート化する"
emoji: "🔔"
type: "tech"
topics:
  - スマートホーム
  - m5stack
  - homebridge
  - homeassistant
published: true
---

<!-- textlint-disable -->

どうもこんにちは、@nzws です。今回は趣味で取り組んだ古のインターホンのスマート化について雑に書いていきます。
普段私は Web 系の開発をしていますが一応大学での専攻が IoT あたりという事もあり、たまにこういう事もやっています。(最近ほぼ IoT っぽいことをやっていませんが...)

<!-- textlint-enable -->

# できたもの

インターホンの来客を知らせるインジケーターを光センサー（CdS セル）で読み取り、Discord/HomePod (Apple HomeKit)/Echo (Amazon Alexa)/Nest Hub (Google Home) にインターホンが鳴ったことを通知する仕組みを作りました。

![](/images/articles/i-made-smart-older-doorbell/cover.gif)
_スマートホーム側の様子 [(動画)](https://youtu.be/3Cr81muqfgE)_

インジケーターを読み取るデバイスは M5StickC で作成しており、別部屋のインターホンに（無理やり）くっつけて設置しています。

![](/images/articles/i-made-smart-older-doorbell/1.jpg)
_エッジデバイスの様子 (ガムテぐるぐる巻き戦法)_

構成を図に表すとこの通りです。それぞれのコンポーネントについて詳しくは後述します。

![構成図](/images/articles/i-made-smart-older-doorbell/conf.png)

# 背景

背景としては普段別の部屋でイヤホンを付けて作業している関係で誰もインターホンに気付けない事が多く、特に子機的なものがあるインターホンでもないのでどうしたものかなという事を常々思っていました。
そのため別の部屋からも気付けるようにしたいと思い、当初はとりあえずインターホン前にリモートカメラを置いてみたものの、カメラの画面自体なかなか確認できずあまり改善できなかったため別の手段を検討しました。

少し前に別の方がやられていたインターホンから Discord 等へ通知させるような記事を拝見したのですが[^1][^2][^3]、最近のインターホンには裏に外部機器用の接点出力？なるものがあるそうですが、家にあるインターホンには古すぎるのか特にそういったものはないようでした（＆ハードウェアにはそこまで明るくないので壊したら嫌だなというのもありました）。
なので、インターホンそのものには手を加えずにある程度デジタルな手段で受け取れないか検討したところ、丁度光センサーとして使用できる CdS セルが家に転がっていたのを発見したためインターホンのインジケーターから CdS セルで取れそうかなと思い作ってみました。

また、通知を配信する方法として簡単なのはチャットサービスなので Discord へ送ることにしましたが、作っていく中で各部屋にあるスマートスピーカーにも配信したいと思ったため各スマートホームサービスとの連携についても途中で作りました。
ちなみに家には [HomePod](https://www.apple.com/jp/homepod/) (Apple Home)、[Echo](https://www.amazon.co.jp/b?ie=UTF8&node=5364343051) (Amazon Alexa)、[Nest Hub](https://store.google.com/jp/category/connected_home?hl=ja) (Google Home) といった感じで主に自分のせいでスマートスピーカーがめちゃくちゃ混在しているので全対応させました。

# やったこと

## エッジデバイス作る

まず最初に CdS セルでインジケーターの状態を確認し、MQTT でインジケーターの状態をリアルタイムに送信するエッジデバイスを作成しました。CdS セルについては前述の通り家にあった謎の CdS セルを使用し、マイコン側は [M5StickC](https://docs.m5stack.com/ja/core/m5stickc) を使用しました。多分もっと安いマイコンでも良いと思いますが、何も考えずに無線通信が一通りできて楽なのと単純に手元で余っていたので採用しました。
とりあえず家にあるものでサクッと作りたかったためはんだ付けはやらずにブレッドボード直刺しと導線曲げで適当に作りました。

![](/images/articles/i-made-smart-older-doorbell/2.jpg)
_横にある旧札は気にしないでください＆微妙に配線ミスしてますが参考画像_

でその後に M5StickC のコードを書いてアナログ値の取得をできるようにしてから、徐々に MQTT のパブリッシュをするようにしてとりあえずエッジデバイス単体で動作するところまで持っていきました。

:::details M5StickC のコード（余計なものを入れているのでちょっと長め）

```cpp
// https://github.com/knolleary/pubsubclient

#include <M5StickC.h>
#include <WiFi.h>
#include <PubSubClient.h>

const int cds_port = 36;
const char* wifi_ssid = "ssid";
const char* wifi_password = "password";
const char* mqtt_server = "x.x.x.x";

int screen_showing_count = 0;
int is_clicked_btnA = 0;

WiFiClient wifiClient;
PubSubClient client(wifiClient);

void enable_display_counter() {
  // -1 の場合は無制限
  if (screen_showing_count == -1) {
    return;
  }

  screen_showing_count = 5;
  M5.Axp.SetLDO2(true);
}

void enable_display() {
  screen_showing_count = -1;
  M5.Axp.SetLDO2(true);
}

void disable_display_counter() {
  if (screen_showing_count > 0) {
    screen_showing_count--;

    if (screen_showing_count == 0) {
      disable_display();
    }
  }
}

void disable_display() {
  screen_showing_count = 0;
  M5.Axp.SetLDO2(false);
}

void reset_message() {
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setCursor(0,0);
}

void connect_wifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  WiFi.begin(wifi_ssid, wifi_password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    enable_display();
    reset_message();
    M5.Lcd.println("Connecting to WiFi...");
  }

  enable_display();
  reset_message();
  M5.Lcd.println("Connected to WiFi");
}

void connect_mqtt() {
  if (client.connected()) {
    return;
  }


  enable_display();
  reset_message();
  M5.Lcd.println("Connecting to MQTT server...");

  uint64_t chipid = ESP.getEfuseMac();
  String clientId = "ESP32Client-" + String((uint16_t)(chipid >> 32), HEX);

  client.setServer(mqtt_server, 1883);
  client.connect(clientId.c_str());

  if (!client.connected()) {
    enable_display();
    reset_message();
    M5.Lcd.println("ERR: Failed to connect to MQTT server");
  }
}

void publish_message(const char* topic, int value) {
  if (!client.connected()) {
    connect_mqtt();
  }

  client.publish(topic, String(value).c_str());
}

void setup() {
  Serial.begin(115200);
  m5.begin();
  pinMode(cds_port, INPUT);
  randomSeed(micros());

  M5.Lcd.setRotation(1);
  // M5.Axp.ScreenBreath(7);
  M5.Lcd.fillScreen(BLACK);

  connect_wifi();
  connect_mqtt();
  disable_display();
  enable_display_counter();
}

void loop() {
  M5.update();

  int d = analogRead(cds_port);
  int btnA = M5.BtnA.wasReleasefor(1);
  int btnB = M5.BtnB.wasReleasefor(1);

  if (btnA || btnB) {
    enable_display_counter();
  }

  if (btnA == 1 && is_clicked_btnA == 0) {
    is_clicked_btnA = 1;

    publish_message("doorbell/btn_a_status", 1);
    enable_display();
  } else if (btnA == 1 && is_clicked_btnA == 1) {
    is_clicked_btnA = 0;

    publish_message("doorbell/btn_a_status", 0);
    disable_display();
  }

  reset_message();
  m5.Lcd.printf("CDS: %4d\n", d);
  if (is_clicked_btnA) {
    m5.Lcd.println("BTN A: Pressed\n");
  }

  publish_message("doorbell/cds", d);
  disable_display_counter();

  delay(1000);
}
```

:::

![](/images/articles/i-made-smart-older-doorbell/3.png)
_mosquitto CLI で動作確認している様子_

## サーバー書く

次に MQTT 経由で受け取ったセンサーの値を判定し Discord 等各所に送っていくサーバー側を書いていきます。すでに家の中で Discord 送受信させたり色々やる内部用のアプリケーションがあるので、そのアプリケーションを拡張する形で適当に書きました。

サーバー周りの実装としては単純に MQTT から CdS セルの値を受け取り、閾値以上であれば Discord に通知を送信し、かつ後述の他サービス向けに閾値よりも上がった事を MQTT で再配信します。その後、一定期間内に閾値以上のデータが飛ばなくなったら閾値よりも下がったことを配信します。
また、エッジデバイス側に電源が上手く刺さっていなかった等で止まることがあったものの気づかないという事があったため、ウォッチドッグタイマーを簡易的に作成し一定期間データの受信が無かった場合にも同様に Discord へ通知させます。

:::details サーバー側のコード（抜粋）

```typescript
import { Client, Message, TextChannel } from "discord.js";
import mqtt from "mqtt";
import config from "../../config";
import { log } from "../../utils/logger";
import { BaseService } from "./service";

const CDS_THRESHOLD = 300;

export class DoorbellService extends BaseService {
  private listenChannel?: TextChannel;
  private mqtt?: mqtt.MqttClient;
  private lastCdsValue = 0;
  private lastCdsTimestamp = 0;
  private lastNotifyTimestamp = 0;
  private resetStateTimeout?: NodeJS.Timeout;
  private cdsWatchdog?: NodeJS.Timeout;

  constructor() {
    super({
      name: "インターホン",
      channels: [config.doorbellChannel],
    });
  }

  async initialize(client: Client): Promise<void> {
    const channel = await client.channels.fetch(config.doorbellChannel);
    if (!channel || !channel.isText()) {
      throw new Error("Unknown channel");
    }
    this.listenChannel = channel as TextChannel;

    this.mqtt = mqtt.connect(`mqtt://${config.mqtt.host}:${config.mqtt.port}`);

    this.mqtt.subscribe("doorbell/cds");

    this.mqtt.on("message", (topic, message) => {
      switch (topic) {
        case "doorbell/cds":
          this.handleCdsValue(Number(message.toString()));
          break;
      }
    });
  }

  handleCdsValue(value: number) {
    if (!this.lastCdsTimestamp) {
      void this.listenChannel?.send(
        `[Watchdog] CDS値を取得しました (${value})`,
      );
    }

    this.lastCdsValue = value;
    this.lastCdsTimestamp = Date.now();

    if (this.cdsWatchdog) {
      clearTimeout(this.cdsWatchdog);
      this.cdsWatchdog = undefined;
    }

    this.cdsWatchdog = setTimeout(() => {
      this.lastCdsTimestamp = 0;
      void this.listenChannel?.send(
        "[Watchdog] CDS値が1分間更新されていません、ハードウェアの状態を確認してください",
      );
    }, 1000 * 60);

    if (value < CDS_THRESHOLD) {
      return;
    }

    if (!this.lastNotifyTimestamp) {
      this.lastNotifyTimestamp = Date.now();
      void this.listenChannel?.send(
        `@here 🔔 たぶんインターホンが鳴っています (${new Date().toLocaleString("ja-JP")})`,
      );
      void this.handleRing();
    }

    if (this.resetStateTimeout) {
      clearTimeout(this.resetStateTimeout);
      this.resetStateTimeout = undefined;
    }

    this.resetStateTimeout = setTimeout(() => {
      this.lastNotifyTimestamp = 0;
      this.mqtt?.publish("doorbell/ring", "0");

      if (this.resetStateTimeout) {
        clearTimeout(this.resetStateTimeout);
        this.resetStateTimeout = undefined;
      }
    }, 1000 * 10);
  }

  async handleRing() {
    for (let i = 0; i < 5; i++) {
      this.mqtt?.publish("doorbell/ring", "1");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async execute(msg: Message<boolean>): Promise<void> {
    if (!this.lastCdsTimestamp) {
      await msg.reply("CDS値が取得できていません");
      return;
    }

    await msg.reply(
      `CDS値: ${this.lastCdsValue} (${new Date(this.lastCdsTimestamp).toLocaleString("ja-JP")})`,
    );
  }
}
```

:::

でサーバーとエッジデバイスを動かすとこのように Discord で通知を受け取れるようになりました。

![](/images/articles/i-made-smart-older-doorbell/4.png)
_Discord の通知の様子_

## Homebridge プラグイン書く

当初の目的としては Discord へ通知できるようになったので達成できたのですが、ここから調子に乗って各種スマートホームデバイスの対応を始めました。
まずは Apple の HomeKit で、HomeKit は Homebridge という TypeScript 製の OSS を使うことによって自由に拡張できます。

https://homebridge.io/

基本的に私は TypeScript を書くのでいつもスマートデバイスを対応させるときには Homebridge を起点にしています。
今回作ったプラグインはこちらで、単純に MQTT の配信データからドアベル/接触センサーとして振る舞うアクセサリーを設定できます。

https://github.com/nzws/homebridge-mqtt-doorbell

Doorbell サービス[^4]は Programmable Switch Event（ステートレススイッチ）を持ち、値を更新すると更新したタイミングで iPhone や HomePod 等に通知が行きます。HomePod はアクセサリーの追加時に通知するように設定すると、能動的に音を鳴らしてくれます。ただし 1 回ピンポンと鳴るだけなので、複数回鳴らしてほしい場合は送る側で鳴ってほしい回数を送りまくると単純にその回数鳴ります。

![](/images/articles/i-made-smart-older-doorbell/5.jpg)
_iPhone で通知を受け取る様子_

一方欠点としては Home アプリ側でドアベルは謎に「未サポート」という表示が出ており（オートメーション等含め）細かい事ができないので、別途人感センサーとしても認識させることで柔軟に使えるようにします。
OccupancySensor（人感センサー）サービス[^5]は OccupancyDetected（ステートフルな状態）を持ち、単純に 1 を投げたら検知、0 を投げると未検知として状態を出すことができます。OccupancySensor によって人感センサーとしてオートメーション等を行うことができ、また後述の Home Assistant でもそのまま使えるようになるので便利です。

補足ですが、私の環境では Homebridge はいったん Home Assistant (HASS) に HomeKit Device で接続し、Apple Home アプリは HASS の HomeKit 連携から接続しています。
こうすることでハブのような感じになり上手く他の Google Home 等と連動できるようになる一方で、HASS 側で対応していないものは（試してないですが多分）伝わらなくなります。その一例として Doorbell サービスが挙げられます。
そのため、細かいアクセサリーは HASS 経由ではなく Homebridge から直接 Home アプリと接続できるように、Homebridge の Child Bridge 機能を用いて個別に接続することでそのままアクセサリーを使用できるようにします。

## Home Assistant (HASS) に繋げる

次に HASS を用いて Alexa と Google Home の対応をします。私の環境では前述の通り Homebridge からデータを受け取って各種スマートホームサービスへデータを渡す役目を持っています。恐らく [Matter](https://csa-iot.org/all-solutions/matter/) がそのうちこの役目を代替できるかもしれませんが、現状は上手く動かせる自信がないので HASS を活用しています。

https://www.home-assistant.io/

Homebridge プラグインのアクセサリーを HomeKit Device インテグレーション[^6]を使って HASS 側で使用できるようにすると、OccupancySensor（Homebridge）アクセサリーが BinarySensor（HASS）エンティティとして登録されます。

![](/images/articles/i-made-smart-older-doorbell/6.png)
_HASS のダッシュボード_

BinarySensor として登録されイベントを受信できれば、あとは HASS で自由にオートメーションを組むなど連携できます。

### Alexa

Alexa はドアベルのイベント受信をサポートしており、HASS では BinarySensor に対して Alexa ではドアベルとして振る舞うように設定すると Alexa 上でドアベル仕様のセンサーデバイスにできます[^7]。
HASS の configuration.yaml の alexa 内で目的の BinarySensor に対して `display_categories` を上書きしてあげることで設定可能です。

```yml
alexa:
  smart_home:
    # ...
    entity_config:
      binary_sensor.doorbell_sensor:
        name: "インターホン"
        display_categories: DOORBELL
```

あとはスマホの Alexa アプリ上でスマートデバイスの再検出をし、ドアベルを Echo デバイスで通知させるようにすれば設定は完了です。

![](/images/articles/i-made-smart-older-doorbell/7.png)
_Alexa アプリの設定画面_

### Google Home

Google Home についてはどう動作するかは分かりませんが、HASS の Event エンティティがドアベルとして振る舞うようにできるようです[^8]。
しかし、Event エンティティの作り方がいまいち分からず、恐らく HASS のプラグイン作成が必要そうなので今回は諦めて単純に TTS で喋らせることにしました。
TTS は Google Home デバイスをメディアプレイヤーとして登録しておけば、HASS のオートメーションで簡単に行うことができます。

```yml
alias: Doorbell TTS
description: ""
trigger:
  - type: occupied
    platform: device
    device_id: xxx
    entity_id: xxx
    domain: binary_sensor
condition: []
action:
  - action: tts.google_translate_say
    data:
      cache: true
      language: ja
      message: インターホンが鳴っています。
      entity_id: media_player.nesthub1
mode: single
```

このように設定すると、HASS の BinarySensor が検知したタイミングで Google Home がいきなり喋りだします。

# 最後に

<!-- textlint-disable -->

これらを作成したことで一番最初に紹介したインターホンの通知ができるようになりました。
このような感じで私の家のスマートホームが変に乱雑になっているせいでとても面倒くさい手順を駆け足で重ねましたが、結構いろいろと駆使しながらデバイスを繋げていってモノのインターネット感を出していく（？）のは結構楽しい作業でした。
私は今は大学に通いながら Web 系のお仕事をしていますが、いつかスマートホームなど IoT 分野でもお仕事をしたいなとは思いつつ最近は TypeScript しか触っていません...

<!-- textlint-enable -->

# 参考にさせていただいたウェブサイト

- M5StickC 非公式日本語リファレンス： https://lang-ship.com/reference/unofficial/M5StickC/
- M5Stack + 光センサー（型番不明の硫化カドミウムセル）: https://windvoice.hatenablog.jp/entry/2019/09/15/220412
- M5StickC に ENV HAT（気温、湿度、気圧）をサーバーにアップするその 5（Beebotte+MQTT 編）: https://lang-ship.com/blog/work/m5stickc-env-hat-5/
- Nest DoorBell (4): 通知のタイムラグ対策と Home Assistant 連携： https://sympapa.hatenablog.com/entry/2021/10/10/115045

[^1]: https://qiita.com/yomori/items/ca213f1087c2a0e270e1

[^2]: https://nlab.itmedia.co.jp/nl/articles/2402/16/news124.html

[^3]: ちなみにこの記事を書いている時に詳しく調べていたら同様に CdS セルで同じ事をやっている方もいました： https://blog.usuyuki.net/interphone-to-discord

[^4]: https://developers.homebridge.io/#/service/Doorbell

[^5]: https://developers.homebridge.io/#/service/OccupancySensor

[^6]: https://www.home-assistant.io/integrations/homekit_controller/

[^7]: https://www.home-assistant.io/integrations/alexa.smart_home/#doorbell-events

[^8]: https://www.home-assistant.io/integrations/google_assistant/#available-domains
