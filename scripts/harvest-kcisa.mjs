name: harvest-kcisa
on:
  workflow_dispatch:
  schedule:
    - cron: "0 */12 * * *" # 12시간마다(UTC)

jobs:
  run:
    runs-on: ubuntu-latest
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE: ${{ secrets.SUPABASE_SERVICE_ROLE }}
      DATA_GO_KR_KCISA: ${{ secrets.DATA_GO_KR_KCISA }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }

      # 현재는 원문만 적재(디버그 겸용)
      - name: Harvest KCISA → raw_sources (XML)
        run: node scripts/harvest-kcisa.mjs

      - name: Verify KCISA saved to raw_sources
        run: |
          echo "Check in Supabase console:"
          echo "select count(*) from public.raw_sources where source='kcisa' and dataset='cultureinfo.period2';"
