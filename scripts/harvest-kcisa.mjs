name: debug-kcisa
on: { workflow_dispatch: {} }

jobs:
  run:
    runs-on: ubuntu-latest
    env:
      KEY: ${{ secrets.DATA_GO_KR_KCISA }} # 인코딩 키
    steps:
      - name: ping period2 (data.go.kr, _type=json)
        run: |
          FROM=$(date -u +%Y%m%d); TO=$(date -u -d "+7 days" +%Y%m%d)
          URL="https://apis.data.go.kr/B553457/cultureinfo/period2?serviceKey=${KEY}&_type=json&from=${FROM}&to=${TO}&pageNo=1&numOfRows=1"
          echo "[GET] $URL"
          code=$(curl -s -o /tmp/resp -w "%{http_code}" "$URL")
          head -c 300 /tmp/resp; echo; echo "HTTP=$code"

      - name: ping period (data.go.kr, _type=json)
        run: |
          FROM=$(date -u +%Y%m%d); TO=$(date -u -d "+7 days" +%Y%m%d)
          URL="https://apis.data.go.kr/B553457/cultureinfo/period?serviceKey=${KEY}&_type=json&from=${FROM}&to=${TO}&pageNo=1&numOfRows=1"
          echo "[GET] $URL"
          code=$(curl -s -o /tmp/resp -w "%{http_code}" "$URL")
          head -c 300 /tmp/resp; echo; echo "HTTP=$code"

      - name: ping period2 (api.kcisa.kr)
        run: |
          FROM=$(date -u +%Y%m%d); TO=$(date -u -d "+7 days" +%Y%m%d)
          URL="https://api.kcisa.kr/openapi/service/rest/cultureinfo/period2?serviceKey=${KEY}&_type=json&from=${FROM}&to=${TO}&pageNo=1&numOfRows=1"
          echo "[GET] $URL"
          code=$(curl -s -o /tmp/resp -w "%{http_code}" "$URL" || true)
          head -c 300 /tmp/resp || true; echo; echo "HTTP=${code:-curl-failed}"
