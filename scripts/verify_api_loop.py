"""
Verification script for API endpoints and end-to-end loop.
"""
import urllib.request
import json

base_url = 'http://localhost:8000'

def get_json(endpoint, user_id='usr_bdm_1'):
    req = urllib.request.Request(f'{base_url}{endpoint}')
    req.add_header('X-User-Id', user_id)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def post_json(endpoint, data, user_id='usr_bdm_1'):
    req = urllib.request.Request(
        f'{base_url}{endpoint}',
        data=json.dumps(data).encode(),
        headers={'Content-Type': 'application/json', 'X-User-Id': user_id}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def main():
    # 1. Reports
    reports = get_json('/reports')
    print(f'=== 1. REPORTS === count: {len(reports)}')
    for r in reports:
        print(f"  - {r.get('id')}: {r.get('name')} (score: {r.get('score')}, status: {r.get('status')})")

    # 2. Properties
    props = get_json('/properties')
    print(f'\n=== 2. PROPERTIES === count: {len(props)}')
    for p in props:
        print(f"  - {p.get('id')}: {p.get('title')} (stage: {p.get('stage')}, rent: Rs.{p.get('rent_monthly')})")

    # 3. Scout Assignments
    asgs = get_json('/scout-assignments')
    print(f'\n=== 3. SCOUT ASSIGNMENTS === count: {len(asgs)}')
    for a in asgs:
        print(f"  - {a.get('id')}: to {a.get('assigned_to_name')} (cell: {a.get('cell_id')}, status: {a.get('status')})")

    # 4. Studies
    studies = get_json('/studies')
    print(f'\n=== 4. STUDIES === count: {len(studies)}')
    for s in studies:
        print(f"  - {s.get('id')}: status={s.get('status')}, target={s.get('target_type')}, prop={s.get('property_id')}")

    # 5. Field Rep Queues
    bde1_asgs = get_json('/scout-assignments/mine', user_id='usr_bde_1')
    print(f'\n=== 5. BD EXEC 1 QUEUE === count: {len(bde1_asgs)}')

    se1_tasks = get_json('/tasks/mine', user_id='usr_se_1')
    print(f'=== 6. SURVEY EXEC 1 QUEUE === count: {len(se1_tasks)}')

    # 6. Test 6-Month Spatial Reuse Rule on Property 3 (Vijayanagar Bus Terminus, ~160m from Property 2)
    print('\n=== 7. TESTING 1-CLICK SPATIAL REUSE RULE ===')
    reuse_res = post_json('/studies', {
        'target_type': 'property',
        'property_id': 'prop_demo_velachery_2',
        'radius_m': 1000.0
    })
    print('Reuse Result:')
    print(f"  ID: {reuse_res.get('id')}")
    print(f"  Reused: {reuse_res.get('reused')}")
    print(f"  Status: {reuse_res.get('status')}")
    print(f"  Reuse Message: {reuse_res.get('reuse_message')}")
    print(f"  Reused From: {reuse_res.get('reused_from_request_id')}")

    assert reuse_res.get('reused') is True, "Expected 6-Month Spatial Reuse rule to trigger!"
    assert reuse_res.get('reused_from_request_id') == 'std_demo_velachery_1', "Expected to reuse std_demo_velachery_1!"
    print('\n>>> ALL API VERIFICATIONS AND SPATIAL REUSE CHECKS PASSED 100%! <<<\n')

if __name__ == '__main__':
    main()
