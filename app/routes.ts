import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route(":sessionId", "routes/viewer.tsx"),
  route(":sessionId/admin", "routes/admin.tsx"),
  route(":sessionId/screen", "routes/screen.tsx"),
] satisfies RouteConfig;
