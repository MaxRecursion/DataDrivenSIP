import { Route, Routes } from "react-router";
import { FundPage } from "./routes/fund";
import { FundsPage } from "./routes/funds";
import { Home } from "./routes/home";
import { Layout } from "./routes/layout";
import { SupportPage } from "./routes/support";

/** Routes only. The router itself differs between the browser and the prerender. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/funds" element={<FundsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/f/:code" element={<FundPage />} />
        <Route path="*" element={<FundPage />} />
      </Route>
    </Routes>
  );
}
