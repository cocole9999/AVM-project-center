#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
AVM 4模块端到端最终验证
覆盖：V1.0 (工作项) + V1.1 (流程/评审) + V1.2 (图表/仪表盘) + AI + 用户
"""
import requests
import json
import sys

BASE = "http://localhost:4000"
results = []

def check(name, ok, detail=""):
    mark = "✅" if ok else "❌"
    print(f"  {mark} {name}{(' - ' + detail) if detail else ''}")
    results.append((name, ok, detail))

print("=" * 60)
print("AVM 4模块端到端最终验证")
print("=" * 60)

# === V1.0 工作项 ===
print("\n[V1.0] 工作项核心")
r = requests.get(f"{BASE}/api/work-items?type=requirement&limit=5")
items = r.json()
check("GET /work-items?type=requirement", r.status_code == 200, f"count={len(items) if isinstance(items, list) else len(items.get('data', []))}")

# 创建工作项
new_item = {
    "type": "task",
    "title": "E2E终验-自动测试任务",
    "priority": "P1",
    "estimate": 5,
    "module": "自动化测试",
    "reporter": "e2e-bot",
    "assignee": "zhangsan"
}
r = requests.post(f"{BASE}/api/work-items", json=new_item)
ok = r.status_code == 201
task_id = r.json().get("id") if ok else None
check("POST /work-items (创建任务)", ok, f"id={task_id}")

# === V1.1 流程 ===
print("\n[V1.1] 流程引擎")
r = requests.get(f"{BASE}/api/flows")
flows = r.json()
check("GET /flows", r.status_code == 200 and len(flows) >= 3, f"flows={len(flows)}")

# 找到 task flow
task_flow = next((f for f in flows if "task" in f["name"].lower() or "任务" in f["name"]), flows[0])
# 找第一个需求flow
req_flow = next((f for f in flows if "需求" in f["name"]), flows[0])
r = requests.get(f"{BASE}/api/flows/{req_flow['id']}")
flow_detail = r.json()
nodes = flow_detail.get("nodes", [])
check("GET /flows/:id (详情)", r.status_code == 200, f"nodes={len(nodes)}")

# === V1.1 评审 ===
print("\n[V1.1] 评审引擎")
r = requests.get(f"{BASE}/api/reviews/templates/all")
templates = r.json()
check("GET /reviews/templates/all", r.status_code == 200 and len(templates) >= 3, f"templates={len(templates)}")

# 取一个 workItem
r = requests.get(f"{BASE}/api/work-items?type=requirement&limit=1")
items_data = r.json()
if isinstance(items_data, list):
    wi = items_data[0]
else:
    wi = items_data.get("data", items_data)[0]
template = next((t for t in templates if t["reviewType"] == "qr"), templates[0])

# 解析模板items
import base64
tmpl_items = json.loads(template["items"]) if isinstance(template["items"], str) else template["items"]

review_body = {
    "workItemId": wi["id"],
    "title": f"E2E终验评审-{wi['key']}",
    "initiator": "e2e-bot",
    "reviewType": template["reviewType"],
    "participants": [
        {"userId": "pm", "userName": "项目经理", "role": "chair"},
        {"userId": "zhangsan", "userName": "张三", "role": "reviewer"},
    ],
    "items": [{"name": it["name"], "itemType": it.get("itemType", "score"), "description": it.get("description", ""), "maxScore": it.get("maxScore", 5)} for it in tmpl_items]
}
r = requests.post(f"{BASE}/api/reviews", json=review_body)
ok = r.status_code == 201
review_id = r.json().get("id") if ok else None
check("POST /reviews (创建评审)", ok, f"id={review_id}")

if review_id:
    # 提交评审
    submissions = [{"itemId": it["id"], "score": 4, "comment": "E2E自动通过"} for it in r.json().get("items", [])]
    r = requests.post(f"{BASE}/api/reviews/{review_id}/submit", json={"userId": "pm", "submissions": submissions})
    check("POST /reviews/:id/submit", r.status_code == 200)
    # 总结论
    r = requests.post(f"{BASE}/api/reviews/{review_id}/finalize", json={"conclusion": "approved", "summary": "E2E终验通过"})
    check("POST /reviews/:id/finalize", r.status_code == 200)

# === V1.2 图表 ===
print("\n[V1.2] 图表与仪表盘")
r = requests.get(f"{BASE}/api/charts")
charts = r.json()
check("GET /charts", r.status_code == 200 and len(charts) >= 6, f"charts={len(charts)}")

# 数据预览
r = requests.post(f"{BASE}/api/charts/preview", json={
    "chartType": "bar",
    "dimensions": [{"field": "status", "alias": "状态"}],
    "measures": [{"field": "count", "alias": "数量"}],
    "source": "work_items"
})
check("POST /charts/preview", r.status_code == 200)

# 仪表盘
r = requests.get(f"{BASE}/api/dashboards")
dashes = r.json()
check("GET /dashboards", r.status_code == 200 and len(dashes) >= 2, f"dashboards={len(dashes)}")

# === AI ===
print("\n[AI] 智能引擎")
r = requests.get(f"{BASE}/api/ai/configs")
configs = r.json()
check("GET /ai/configs", r.status_code == 200 and len(configs) >= 4, f"configs={len(configs)}")

# AI 问答
r = requests.post(f"{BASE}/api/ai/qa", json={"question": "P0多少个"})
b = r.json()
check("POST /ai/qa (P0多少个)", r.status_code == 200 and ("P0" in b.get("answer", "") or "p0" in b.get("answer", "").lower()), f"answer={b.get('answer','')[:50]}")

# AI 估分
r = requests.post(f"{BASE}/api/ai/suggest-estimate", json={"type": "task", "title": "用户登录功能", "description": "支持手机号和邮箱登录"})
b = r.json()
check("POST /ai/suggest-estimate", r.status_code == 200 and "estimate" in b, f"estimate={b.get('estimate')}")

# AI 缺陷归类
r = requests.post(f"{BASE}/api/ai/classify-bug", json={"title": "页面样式错乱", "description": "登录按钮颜色显示不对"})
b = r.json()
check("POST /ai/classify-bug", r.status_code == 200 and b.get("category"), f"category={b.get('category')}")

# AI 周报
r = requests.get(f"{BASE}/api/ai/weekly-report", params={"user": "zhangsan"})
b = r.json()
check("GET /ai/weekly-report", r.status_code == 200 and "summary" in b, f"summary length={len(b.get('summary',''))}")

# === 用户 ===
print("\n[用户] 权限模型")
r = requests.get(f"{BASE}/api/users")
users = r.json()
check("GET /users", r.status_code == 200 and len(users) >= 7, f"users={len(users)}")

# 汇总
total = len(results)
passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{'=' * 60}")
print(f"汇总: {passed}/{total} 通过 ({'🎉 全部通过' if passed == total else f'❌ {total - passed} 失败'})")
print(f"{'=' * 60}")
sys.exit(0 if passed == total else 1)
