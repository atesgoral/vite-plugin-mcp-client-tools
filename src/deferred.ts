export class Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void = () => {};
  reject: (error: unknown) => void = () => {};

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
