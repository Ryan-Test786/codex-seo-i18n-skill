# seo-i18n Skill

用于场景化 SEO JSON 文案生产与多语言输出的 SEO Trinity I18n Agent。

## 1. 这个 Skill 能做什么

- 将场景页面内容抽象为标准化 JSON。
- 按人工编写流程产出核心 `zh` / `en` / `zh-hant` 文件。
- 使用腾讯混元 API 脚本将英文扩展翻译到其他语种。
- 在多语言输出中保持 URL/path/resource 字段不变。

## 2. 目录结构

```text
skills/seo-i18n/
  SKILL.md
  config.json
  agents/openai.yaml
  references/
  scripts/
```

## 3. 如何发布（维护者）

1. 在仓库中保留目录为 `skills/seo-i18n`。
2. 确保 `config.json` 不包含真实密钥（`TENCENT_SECRET_ID` 和 `TENCENT_SECRET_KEY` 都应为空字符串）。
3. 推送到 GitHub。
4. 建议打版本标签，例如 `v1.0.0`。

## 4. 用户如何安装

用户通过 Codex 内置安装脚本安装。

### Windows（PowerShell）

```powershell
python "$HOME/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py" `
  --repo <owner>/<repo> `
  --path skills/seo-i18n `
  --ref v1.0.0
```

### Linux/macOS（bash/zsh）

```bash
python "$HOME/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo <owner>/<repo> \
  --path skills/seo-i18n \
  --ref v1.0.0
```

也可以使用 URL 安装：

```bash
python "$HOME/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --url https://github.com/<owner>/<repo>/tree/v1.0.0/skills/seo-i18n
```

安装完成后请重启 Codex，才能加载新 skill。

## 5. 安装位置

- 设置了 `CODEX_HOME`：`$CODEX_HOME/skills/seo-i18n`
- 未设置 `CODEX_HOME`：`~/.codex/skills/seo-i18n`

示例：
- Windows 默认：`C:\Users\<username>\.codex\skills\seo-i18n`
- Linux 默认：`/home/<username>/.codex/skills/seo-i18n`

## 6. 密钥配置（推荐环境变量）

翻译脚本同时支持 `config.json` 和环境变量。
优先级：
1. `config.json` 中的非空值
2. 环境变量回退值

推荐做法：`config.json` 保持空值，仅使用环境变量。

### Windows（PowerShell，当前会话）

```powershell
$env:TENCENT_SECRET_ID="your_secret_id"
$env:TENCENT_SECRET_KEY="your_secret_key"
```

### Windows（PowerShell，持久化到当前用户）

```powershell
[Environment]::SetEnvironmentVariable("TENCENT_SECRET_ID","your_secret_id","User")
[Environment]::SetEnvironmentVariable("TENCENT_SECRET_KEY","your_secret_key","User")
```

### Linux/macOS（当前 shell）

```bash
export TENCENT_SECRET_ID="your_secret_id"
export TENCENT_SECRET_KEY="your_secret_key"
```

### Linux/macOS（持久化）

将以下内容写入 `~/.bashrc` 或 `~/.zshrc`：

```bash
export TENCENT_SECRET_ID="your_secret_id"
export TENCENT_SECRET_KEY="your_secret_key"
```

然后执行：

```bash
source ~/.bashrc
# 或
source ~/.zshrc
```

## 7. 升级与卸载

安装器在目标目录已存在时会直接报错并终止。

升级步骤：
1. 删除旧目录 `~/.codex/skills/seo-i18n`（或 `$CODEX_HOME/skills/seo-i18n`）。
2. 使用新的 `--ref` 重新安装。
3. 重启 Codex。

卸载步骤：
1. 删除 `~/.codex/skills/seo-i18n`（或 `$CODEX_HOME/skills/seo-i18n`）。
2. 重启 Codex。

## 8. 快速验证

重启后，输入类似提示词：

```text
Use $seo-i18n to process my scenario input package.
```

若 skill 加载成功，Codex 会按 `SKILL.md` 中的 `seo-i18n` 工作流执行。
