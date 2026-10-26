/**
 * File d'attente à concurrence bornée.
 *
 * Les limites secondaires de l'API GitHub — 100 requêtes concurrentes, 900
 * points par minute — s'appliquent au jeton, donc à l'installation entière :
 * tous les utilisateurs partagent le même budget. Le proxy étant sans état, il
 * ne peut pas réguler. La régulation vit donc ici. Voir RG-regulation-appels.
 *
 * La valeur par défaut est délibérément prudente : dépasser les limites
 * secondaires coûte un 403 avec `Retry-After`, bien avant l'épuisement du quota
 * horaire.
 */
export class RateLimiter {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly maxConcurrent = 6) {}

  /** Exécute `task` dès qu'un créneau se libère. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}
