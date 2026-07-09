/** Paginação de um {@link SyncDefinition}. */
export interface PaginationDefinition {
  /**
   * Itens por página. Usado tanto no `$ref: "pageSize"` da request
   * (pull) quanto pra limitar quantas linhas da sync_queue entram
   * num request de push.
   */
  pageSize: number;

  /**
   * Teto de páginas por sessão de sync (mesma janela de conectividade).
   * Evita loop longo demais drenando bateria numa única wake do
   * scheduler. Ao atingir o teto com `hasMore` ainda `true`, o engine para
   * e retoma no próximo wake — cursor já avançou até onde deu.
   *
   * @default 20
   */
  maxPagesPerSession?: number;
}
