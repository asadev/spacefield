/* Barrel for the search lib — keeps imports tidy. */

export { runGlobalSearch } from "./query";
export {
  indexDocument,
  unindexDocument,
  bulkIndex,
  type IndexDocumentInput,
  type UnindexDocumentInput,
} from "./indexer";
export {
  labelForEntity,
  ENTITY_LABELS,
  type SearchHit,
  type SearchGroup,
  type SearchResponse,
} from "./types";
