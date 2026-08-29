# MTR Time Scheduler

Minecraft Transit Railway (MTR) の Real Time 発車時刻をブラウザ上で作成できる、インストール不要の静的 Web アプリです。

## Web アプリを開く

**[MTR Time Scheduler を GitHub Pages で開く](https://ex-mcmods.github.io/MTR-time-scheduler/)**

駅、駅間距離、列車の等級、運転間隔などを設定すると、ダイヤグラムや時刻表、MTR の Real Time 欄へ入力する発車時刻を生成できます。

## 基本的な使い方

1. 駅リストと Network キャンバスで駅を追加・配置します。
2. 駅間距離と速度制限を設定します。
3. 各等級の停車駅、始発・終発、運転間隔を設定します。
4. 右側の出力欄でダイヤグラム、時刻表、MTR 入力などを確認します。
5. 必要に応じて出力をコピーまたはダウンロードします。

編集中の内容はブラウザのローカルストレージへ自動保存されます。別のブラウザや端末へ移す場合は、画面上部の「保存」でプロジェクト JSON をダウンロードし、移行先で「読込」を使用してください。

## 主な機能

- draw.io 風キャンバスでの駅の追加、配置、ドラッグ操作
- 駅間距離と MTR 速度レール種別の設定
- 等級ごとの停車・通過、番線、停車時間、最高速度の設定
- 始発、終発、運転間隔からの列車生成
- 簡単モードとエキスパートモードの切り替え
- MTR 4 の加速・減速を考慮した走行時間の概算
- 複数の速度制限を持つ駅間の設定
- 上位等級を参照した待避停車と番線間隔の自動調整
- ダイヤグラム、駅プレビュー、時刻表の表示
- MTR Real Time 入力、CSV、JSON の出力
- プロジェクト JSON の保存と読込

## MTR Real Time との対応

このアプリの「MTR」出力は、Depot の schedule にある Real Time 欄へ貼り付ける発車時刻列として利用できます。個別時刻に加えて、`00:00:00+1440*00:01:00` のような繰り返し式も生成します。

速度プリセットは MTR の Rail Connector Type に合わせ、Wooden 20、Stone 40、Emerald 60、Iron 80、Obsidian 120、Blaze 160、Quartz 200、Diamond 300 km/h を用意しています。

本アプリは MTR ワールドへ直接データを書き込みません。Real Time 入力用テキストと確認・加工用データを生成するツールです。

## ローカルで実行

Node.js と外部パッケージはアプリの実行には不要です。リポジトリを取得し、静的 HTTP サーバーで公開してください。プロジェクトに含まれるコマンドを使う場合は次のとおりです。

```bash
npm start
```

ブラウザで `http://localhost:4173` を開きます。

## 開発とテスト

```bash
npm test
npm run build
```

`npm run build` は GitHub Pages へ配置する静的ファイルを `dist/` に生成します。

## GitHub Pages へのデプロイ

`main` ブランチへの push を契機に、GitHub Actions がテスト、ビルド、GitHub Pages へのデプロイを自動実行します。

フォークしたリポジトリで利用する場合は、初回のみ **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選択してください。また、README と公開 URL はフォーク先のアカウント名・リポジトリ名に合わせて変更してください。

## 参考資料

- [MTR Getting Started / Schedules](https://wiki.minecrafttransitrailway.com/mtr%3Agetting_started)
- [MTR Rails / Rail Connector Type](https://wiki.minecrafttransitrailway.com/mtr%3Arails)
- [MTR 4.0](https://wiki.minecrafttransitrailway.com/mtr%3A4.0.x)
- [MTR Development Documentation](https://wiki.minecrafttransitrailway.com/mtr%3Adevelopment)
- [MTR API Reference](https://wiki.minecrafttransitrailway.com/mtr%3Adevelopment%3Aapi_reference)
