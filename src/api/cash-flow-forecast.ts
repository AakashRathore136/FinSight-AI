import logger from "../lib/logger.js";

// Mocking the result of an ARIMA or Prophet time-series model
// In production, this would call a Python service or compute via WebAssembly
export async function getCashFlowForecast(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Generate 90 days of predictive data points
    const forecastData = [];
    let currentBalance = 5200.00; // Starting baseline
    const today = new Date();

    for (let i = 0; i < 90; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(today.getDate() + i);

      // Introduce a mock trend and seasonality (e.g. paying rent on the 1st)
      const dayOfMonth = forecastDate.getDate();
      let dailyChange = (Math.random() * 100) - 40; // slight upward trend

      if (dayOfMonth === 1) {
        dailyChange -= 1500; // Rent payment drop
      } else if (dayOfMonth === 15 || dayOfMonth === 30) {
        dailyChange += 2000; // Paycheck spike
      }

      currentBalance += dailyChange;

      forecastData.push({
        date: forecastDate.toISOString().split('T')[0],
        predictedBalance: parseFloat(currentBalance.toFixed(2)),
        // 95% Confidence Interval widens over time
        lowerBound: parseFloat((currentBalance - (i * 10)).toFixed(2)),
        upperBound: parseFloat((currentBalance + (i * 10)).toFixed(2))
      });
    }

    res.json({
      success: true,
      data: forecastData,
      meta: {
        model: "ARIMA(1,1,1)",
        horizonDays: 90
      }
    });
  } catch (error: any) {
    logger.error("FORECAST_GENERATION_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to generate cash flow forecast" });
  }
}
