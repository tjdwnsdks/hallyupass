import { buildUrl, getWithPreview, parseJsonOrThrow } from "./http.mjs";

/** Call data.go.kr style JSON endpoints with guardrails */
export async function fetchOpenApiJson(base, path, params) {
  const url = buildUrl(base, path, params);
  console.log("[GET]", url);
  const { bodyBuf, info } = await getWithPreview(url);
  // Auth error commonly returns XML OpenAPI_ServiceResponse
  if (/OpenAPI_ServiceResponse/i.test(info.head) && /SERVICE_KEY_IS_NOT_REGISTERED/i.test(info.head)) {
    throw new Error("AuthError:SERVICE_KEY_IS_NOT_REGISTERED (check double-encoding like %252B/%253D and domain/whitelist)");
  }
  return parseJsonOrThrow(bodyBuf, info.contentType);
}

/** Simple pager until no items or page limit reached */
export async function* pagedJson({ base, path, params, pageParam="pageNo", rowsParam="numOfRows", maxPages=50 }) {
  let page = Number(params?.[pageParam] ?? 1);
  for (let i=0; i<maxPages; i++){
    const p = { ...params, [pageParam]: String(page) };
    const json = await fetchOpenApiJson(base, path, p);
    yield json;
    // Heuristic stop when items length < page size
    const items = json?.response?.body?.items?.item ?? json?.response?.body?.items ?? [];
    const size = Number(p[rowsParam] ?? 10);
    if (!Array.isArray(items)) break;
    if (items.length < size) break;
    page++;
  }
}
