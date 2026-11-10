# Claudeで画像を作る

Claudeは写真のような画像を直接は出力できません。このリポジトリでは **無料で完結する次の2方式** を用意しています。

## 1. 訪問者向け: `banner-maker.html`
ブラウザ内だけで動くバナー作成ページ(API・サーバー不要)。文字・テーマ・サイズを選んで PNG/SVG を保存できます。

## 2. 運営者向け: Claudeに SVG を描かせる
1. Claudeに「`assets/generated/` に○○のバナーSVGを作って」と依頼(viewBox必須)
2. PNGが必要なら `node tools/svg2png.js assets/generated/xxx.svg`

## できないこと
リアルな写真風画像は外部の画像生成API(有料・APIキー管理とサーバー側実装が必要)が必須のため、「月額ゼロ」の方針により未対応です。必要になった場合は別途ご相談ください。
