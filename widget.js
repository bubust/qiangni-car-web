// 牆泥車況：iPhone 小工具（Scriptable）
// 安裝：App Store 裝 Scriptable → 新增一個 script，整份貼上 → 在 Scriptable 裡按一次執行，照提示輸入
//       帳號、密碼（存在 iPhone 的鑰匙圈，不在這個檔案裡）。安裝頁：https://bubust.github.io/qiangni-car-web/iphone.html
// 加到桌面：長按桌面 → ＋ → Scriptable → 選小或中尺寸 → 編輯小工具 → Script 選這個。
// 鎖定畫面：自訂鎖定畫面 → 小工具 → Scriptable → 選方形／長條／一行文字 → Script 選這個。
// 資料：Supabase 的 car_status（牆泥行車紀錄每分鐘上傳）。iOS 大約每 15 分鐘才更新一次小工具。

const K = { url: "qn_url", anon: "qn_anon", email: "qn_email", pw: "qn_pw", token: "qn_token", until: "qn_token_until" };

// 車主的 Supabase 專案：網址和 publishable key 本來就公開，資料靠帳號登入＋RLS 保護
const DEFAULT_URL = "https://mmmhhgnmopvdjzspdkfb.supabase.co";
const DEFAULT_KEY = "sb_publishable_6awiskZ188ou0bd62h_28A_JEP1_Vci";

async function ask() {
  const a = new Alert();
  a.title = "牆泥車況設定";
  a.message = "輸入車主帳號和密碼（只存在這支 iPhone 的鑰匙圈）。";
  a.addTextField("email", Keychain.contains(K.email) ? Keychain.get(K.email) : "");
  a.addSecureTextField("密碼", "");
  a.addAction("儲存");
  a.addCancelAction("取消");
  if ((await a.present()) === -1) return false;
  if (!Keychain.contains(K.url)) Keychain.set(K.url, DEFAULT_URL);
  if (!Keychain.contains(K.anon)) Keychain.set(K.anon, DEFAULT_KEY);
  Keychain.set(K.email, a.textFieldValue(0).trim());
  if (a.textFieldValue(1)) Keychain.set(K.pw, a.textFieldValue(1));
  if (Keychain.contains(K.token)) Keychain.remove(K.token);
  return true;
}

async function token() {
  if (Keychain.contains(K.token) && Number(Keychain.get(K.until)) > Date.now() + 60000) return Keychain.get(K.token);
  const r = new Request(`${Keychain.get(K.url)}/auth/v1/token?grant_type=password`);
  r.method = "POST";
  r.headers = { apikey: Keychain.get(K.anon), "Content-Type": "application/json" };
  r.body = JSON.stringify({ email: Keychain.get(K.email), password: Keychain.get(K.pw) });
  const j = await r.loadJSON();
  if (!j.access_token) throw new Error("登入失敗");
  Keychain.set(K.token, j.access_token);
  Keychain.set(K.until, String(Date.now() + (j.expires_in || 3600) * 1000));
  return j.access_token;
}

async function status() {
  const r = new Request(`${Keychain.get(K.url)}/rest/v1/car_status?select=*`);
  r.headers = { apikey: Keychain.get(K.anon), Authorization: `Bearer ${await token()}` };
  const rows = await r.loadJSON();
  if (!Array.isArray(rows)) throw new Error(rows.message || "讀取失敗");
  return rows[0];
}

const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "剛剛" : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`;
};
const state = (s) => s.charging ? "充電中" : s.plugged ? "插著槍" : s.parked ? "停車" : "行駛中";
const socColor = (v) => v === null ? Color.gray() : v <= 20 ? new Color("#dc2626") : v <= 40 ? new Color("#d97706") : new Color("#16a34a");

function build(s, err) {
  const fam = config.widgetFamily || "medium";
  const w = new ListWidget();
  if (err || !s) {
    w.addText(fam.startsWith("accessory") ? "車況 --" : `牆泥車況\n${err || "還沒有資料"}`).font = Font.systemFont(12);
    return w;
  }
  const soc = s.soc ?? null;
  if (s.lat) w.url = `https://maps.apple.com/?q=${s.lat},${s.lon}`;
  const warn = [];
  if (s.door_open) warn.push("車門沒關");
  if (s.window_open) warn.push("車窗沒關");
  const chargeLine = () => {
    const mins = s.charge_start ? Math.max(0, Math.round((Date.now() - s.charge_start) / 60000)) : null;
    const t = mins === null ? "" : mins >= 60 ? `・${Math.floor(mins / 60)}時${mins % 60}分` : `・${mins}分`;
    return `⚡ ${s.charge_kw ?? "--"}kW・已充 ${s.charge_kwh ?? "--"}kWh${t}`;
  };
  if (fam === "accessoryInline") { w.addText(`🔋${soc ?? "--"}% ${s.range_km ?? "--"}km ${warn.length ? "⚠️" + warn[0] : state(s)}`); return w; }
  if (fam === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const t = w.addText(`${soc ?? "--"}%`); t.font = Font.boldSystemFont(16); t.centerAlignText();
    const u = w.addText(s.charging ? "⚡" : `${s.range_km ?? "--"}`); u.font = Font.systemFont(10); u.centerAlignText();
    return w;
  }
  if (fam === "accessoryRectangular") {
    const t = w.addText(`🔋 ${soc ?? "--"}%　${s.range_km ?? "--"} km`); t.font = Font.boldSystemFont(15);
    if (warn.length) { const wl = w.addText(`⚠️ ${warn.join("・")}`); wl.font = Font.boldSystemFont(12); }
    else w.addText(`${state(s)}・${ago(s.updated_at)}`).font = Font.systemFont(12);
    return w;
  }
  w.setPadding(12, 14, 12, 14);
  const title = w.addText("牆泥 n7"); title.font = Font.semiboldSystemFont(12); title.textColor = Color.gray();
  const big = w.addText(`${soc ?? "--"}%`); big.font = Font.boldSystemFont(fam === "small" ? 40 : 44); big.textColor = socColor(soc);
  w.addText(`續航 ${s.range_km ?? "--"} km`).font = Font.systemFont(14);
  const st = w.addText(`${state(s)}${s.outside_c !== null && fam !== "small" ? `・車外 ${s.outside_c}°C` : ""}`);
  st.font = Font.systemFont(13);
  if (s.charging) st.textColor = new Color("#16a34a");
  if (s.charging && fam !== "small") {
    const c = w.addText(chargeLine()); c.font = Font.systemFont(13); c.textColor = new Color("#16a34a");
  }
  if (warn.length) {
    const wl = w.addText(`⚠️ ${warn.join("・")}`); wl.font = Font.boldSystemFont(fam === "small" ? 12 : 13); wl.textColor = new Color("#dc2626");
  }
  w.addSpacer();
  const up = w.addText(`更新 ${ago(s.updated_at)}`); up.font = Font.systemFont(11); up.textColor = Color.gray();
  return w;
}

let s = null, err = null;
if (config.runsInApp && (!Keychain.contains(K.url) || !Keychain.contains(K.pw))) await ask();
else if (config.runsInApp) {
  const a = new Alert(); a.title = "牆泥車況"; a.addAction("看小工具預覽"); a.addAction("重新設定"); a.addCancelAction("取消");
  if ((await a.present()) === 1) await ask();
}
try {
  if (!Keychain.contains(K.url)) throw new Error("請在 Scriptable 裡執行一次設定");
  s = await status();
} catch (e) { err = e.message; }
const w = build(s, err);
w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
