export function authRedirectUrl(location: Pick<Location, "origin">): string {
  return location.origin;
}
