# MTR Time Scheduler

Minecraft Transit Railway (MTR) の Real Time 発車時刻を作るための静的Webアプリです。

## 起動

```bash
npm start
```

ブラウザで `http://localhost:4173` を開きます。依存パッケージは使っていません。

## できること

- draw.io 風のキャンバスで駅を配置、ドラッグ、駅間距離を編集
- 駅ごとに等級別の停車/通過、番線、停車秒を設定
- 等級ごとに優先度、最高速度、始発/終発、運転間隔を設定
- 先に生成した上位等級を参照して、下位等級の待避停車を自動調整
- MTRの速度レール種別に合わせて区間速度を選択
- 簡単モードとエキスパートモードを切り替え
- 駅プレビューで駅ごとの停車/通過/待避を確認
- ダイヤグラム、駅プレビュー、時刻表、MTR Real Time 入力、CSV、JSON を出力
- プロジェクトJSONの保存/読込

## MTR との対応

MTR Wiki によると、Depot の schedule には Minecraft Time と Real Time があり、Real Time では `17:00:00` のような実時刻や、`00:00:00+1440*00:01:00` のような繰り返し式を入力できます。このアプリの `MTR` 出力はその Real Time 欄へ貼り付ける前提の発車時刻列です。

MTRの速度レールは、RailsページのRail Connector Type表に合わせています。列車用の速度プリセットは Wooden 20、Stone 40、Emerald 60、Iron 80、Obsidian 120、Blaze 160、Quartz 200、Diamond 300 km/h です。

MTR 4.0 では Transport Simulation Core が駅、線路、Depot、車両のデータとシミュレーションを持ち、HTTP API でデータ取得/更新できます。ただしワールドへ直接POSTするには既存の station/platform/route/depot ID と正確なスキーマ合わせが必要です。初版では破壊的な直接書き込みを避け、Real Time 入力と検証用JSONを出力します。

参考:

- MTR Getting Started / Schedules: https://wiki.minecrafttransitrailway.com/mtr%3Agetting_started
- MTR Rails / Rail Connector Type: https://wiki.minecrafttransitrailway.com/mtr%3Arails
- MTR 4.0: https://wiki.minecrafttransitrailway.com/mtr%3A4.0.x
- Development Documentation: https://wiki.minecrafttransitrailway.com/mtr%3Adevelopment
- API Reference: https://wiki.minecrafttransitrailway.com/mtr%3Adevelopment%3Aapi_reference
- Update Data API: https://wiki.minecrafttransitrailway.com/mtr%3Adevelopment%3Aapi_reference%3Aupdate_data

## テスト

```bash
npm test
```
