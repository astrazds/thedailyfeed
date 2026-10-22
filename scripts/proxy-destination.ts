const originFormBrand: unique symbol = Symbol('OriginFormTarget');

export type OriginFormTarget = { readonly [originFormBrand]: true };

interface OriginFormFields extends OriginFormTarget {
  readonly pathname: string;
  readonly search: string;
}

const configuredOriginBrand: unique symbol = Symbol('ConfiguredOrigin');

export type ConfiguredOrigin = string & { readonly [configuredOriginBrand]: true };

export function configuredOrigin(value: string): ConfiguredOrigin {
  return value as ConfiguredOrigin;
}

export function originFormTarget(requestTarget: string): OriginFormTarget {
  const requestUrl = new URL(requestTarget, 'http://runtime.test');
  const target: OriginFormFields = {
    [originFormBrand]: true,
    pathname: requestUrl.pathname,
    search: requestUrl.search,
  };
  return target;
}

export function proxyDestination(target: OriginFormTarget, origin: ConfiguredOrigin): URL {
  const fields = target as OriginFormFields;
  const destination = new URL(origin);
  destination.pathname = fields.pathname;
  destination.search = fields.search;
  return destination;
}
