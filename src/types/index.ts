type HttpProtocol = "http://" | "https://";
type ValidUrl = `${HttpProtocol}${string}`;

export type { ValidUrl };
