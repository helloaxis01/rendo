const association = {
  applinks: {
    apps: [],
    details: [
      {
        appID: "VF9MHWH7NH.app.rendorecipes.rendo",
        appIDs: ["VF9MHWH7NH.app.rendorecipes.rendo"],
        paths: ["/auth/native", "/auth/native/*"],
        components: [{ "/": "/auth/native" }, { "/": "/auth/native/*" }],
      },
    ],
  },
};

export async function GET() {
  return new Response(JSON.stringify(association), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
