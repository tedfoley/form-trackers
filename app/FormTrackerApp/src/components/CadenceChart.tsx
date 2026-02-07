import React, {useRef, useEffect, useState, useCallback} from 'react';
import {Dimensions, StyleSheet, View} from 'react-native';
import {LineChart} from 'react-native-chart-kit';

const CHART_POINTS = 60;
const CHART_UPDATE_MS = 500; // 2 Hz re-renders
const SCREEN_WIDTH = Dimensions.get('window').width;

interface CadenceChartProps {
  cadence: number | null;
}

export function CadenceChart({cadence}: CadenceChartProps) {
  const dataRef = useRef<number[]>(new Array(CHART_POINTS).fill(0));
  const [chartData, setChartData] = useState<number[]>(
    () => new Array(CHART_POINTS).fill(0),
  );

  // Accumulate data into ref on every cadence change
  useEffect(() => {
    if (cadence != null) {
      dataRef.current = [...dataRef.current.slice(1), cadence];
    }
  }, [cadence]);

  // Throttled timer copies ref → state at 2 Hz
  const updateChart = useCallback(() => {
    setChartData([...dataRef.current]);
  }, []);

  useEffect(() => {
    const interval = setInterval(updateChart, CHART_UPDATE_MS);
    return () => clearInterval(interval);
  }, [updateChart]);

  return (
    <View style={styles.container}>
      <LineChart
        data={{
          labels: [],
          datasets: [{data: chartData}],
        }}
        width={SCREEN_WIDTH - 32}
        height={180}
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withHorizontalLabels={true}
        withVerticalLabels={false}
        bezier
        chartConfig={{
          backgroundColor: '#1C1C1E',
          backgroundGradientFrom: '#1C1C1E',
          backgroundGradientTo: '#1C1C1E',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(10, 132, 255, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(142, 142, 147, ${opacity})`,
          propsForBackgroundLines: {
            stroke: '#2C2C2E',
          },
        }}
        style={styles.chart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  chart: {
    borderRadius: 12,
  },
});
