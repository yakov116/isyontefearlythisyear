"use strict";

let outerWidth, outerHeight,
    width, height;

let margin = { top: 20, right: 16, bottom: 20, left: 16 };

let container = d3.select("#vis-container");

let eventHoldover = {
    "Tu BiShvat": 1,
    "Erev Purim": 2,
    "Erev Pesach": 9,
    "Erev Shavuot": 3,
    "Erev Tish'a B'Av": 2,
    "Erev Rosh Hashana": 3,
    "Erev Yom Kippur": 2,
    "Erev Sukkot": 10,
    "Chanukah: 1 Candle": 9
};

let x = d3.local(),
    xTime = d3.local();
let histY = d3.scaleLinear();

d3.json("data.json").then(dataCallback);

let aggData, rawData, upcomingData;
function dataCallback(data) {
    rawData = data;
    
    rawData.forEach(d => {
        d.date = new Date(Date.UTC(2016, d.month - 1, d.day));
        d.actualDate = new Date(Date.UTC(d.year, d.month - 1, d.day));
    });
    rawData = rawData.sort((a, b) => {
        return a.month == b.month ? d3.ascending(a.day, b.day) : d3.ascending(a.month, b.month);
    });

    aggregateData();
    sortByUpcoming(new Date());

    update();
}

function update(transition) {
    let duration = transition ? 400 : 0;

    let events = container.selectAll(".event").data(upcomingData.entries(), d => d.key);
    events.exit().remove();
    let eventsEnter = events.enter().append("div").attr("class", "event");

    let label = eventsEnter.append("h2").attr("class", "label");
    let svg = eventsEnter.append("svg");
    let g = svg.append("g").attr("transform", "translate(" + margin.left + ", " + margin.top + ")");
    let mainG = g.append("g").attr("class", "main");
    let overlayG = g.append("g").attr("class", "overlays");
    overlayG.append("g").attr("class", "yearLine").append("line").attr("y1", 0);
    let xAxisG = g.append("g").attr("class", "xAxis");

    if(eventsEnter.nodes().length > 0) size();

    eventsEnter.each(function(d) {
        let dates = aggData.get(d.key).values().map(dd => dd.date);
        let dateRange = makeDateRange(dates[0], dates[dates.length-1], true);
        x.set(this, d3.scaleBand()
            .domain(dateRange)
            .paddingInner(.3));

        xTime.set(this, d3.scaleUtc()
            .domain([dateRange[0], dateRange[dates.length-1]]));
    });

    events = eventsEnter.merge(events);
    events.order();
    events.select("h2.label").text(d => d.key + " " + d.value.year);

    events.each(function(d) {
        let thisEvent = d3.select(this);
        
        let tx = x.get(this).range([0, width]);
        let txTime = xTime.get(this).range([tx.range()[0] + tx.bandwidth()/2, tx.range()[1] - tx.bandwidth()/2]);

        let xAxis = d3.axisBottom()
            .tickSizeOuter(0)
            .tickFormat(d3.utcFormat("%m-%d"));
        
        thisEvent.select(".xAxis")
            .call(xAxis.scale(txTime).ticks(width <= 768 ? d3.utcWeek.every(1) : d3.utcDay.every(1)));

        let stacked = d3.stack().keys(["nonLeapCount", "leapCount"]).value((dd, k) => dd.value[k])(aggData.get(d.key).entries());
        let bars = thisEvent.select(".main").selectAll("g.bars").data(stacked, dd => dd.key);
        bars.exit().remove();
        bars = bars.enter().append("g")
            .attr("class", "bars")
            .classed("leap", dd => dd.key == "leapCount")
            .merge(bars);
        let bar = bars.selectAll("rect.bar").data(dd => dd, dd => dd.data.key);
        bar.exit().remove();
        bar = bar.enter().append("rect").attr("class", "bar")
            .attr("x", dd => tx(dd.data.key))
            .attr("y", (dd, i) => histY(0))
            .attr("width", tx.bandwidth())
            .attr("height", 0)
            .merge(bar);
        bar.transition().duration(duration)
            .attr("x", dd => tx(dd.data.key))
            .attr("y", (dd, i) => histY(dd[1]))
            .attr("width", tx.bandwidth())
            .attr("height", dd => histY(dd[0]) - histY(dd[1]));

        thisEvent.select(".yearLine line")
            .attr("y2", height)
            .attr("transform", "translate(" + (tx(d.value.date) + tx.bandwidth()/2) + ")");
    });
}

function size() {
    let containerContainer = d3.select(container.node().parentNode);
    outerWidth = parseFloat(containerContainer.style("width"))
        - parseFloat(containerContainer.style("padding-left"))
        - parseFloat(containerContainer.style("padding-right")),
    outerHeight = 100;

    width = outerWidth - margin.left - margin.right,
    height = outerHeight - margin.top - margin.bottom;

    histY.range([height, 0]);
    
    container.selectAll("svg").attr("width", outerWidth).attr("height", outerHeight);
    container.selectAll("g.xAxis").attr("transform", "translate(0, " + height + ")");
}
size();
d3.select(window).on("resize", () => {
    size();
    update();
});

function sortByUpcoming(date) {
    date = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); // convert to naive
    upcomingData = d3.nest()
        .key(d => d.event)
        .rollup(d => d[0]) // .sort((a, b) => d3.ascending(a.actualDate, b.actualDate))
        .map(rawData
            .filter(d => (d.actualDate - date)/1000/3600/24 > -eventHoldover[d.event])
            .sort((a, b) => d3.ascending(a.actualDate, b.actualDate))
        );
}

function aggregateData(startYear, endYear) {
    startYear = startYear == undefined ? d3.min(rawData, d => d.year) : startYear;
    endYear = endYear == undefined ? d3.max(rawData, d => d.year) : endYear;

    let totalYears = endYear - startYear + 1;

    aggData = d3.nest()
        .key(d => d.event)
        .key(d => d.date)
        // .sortValues((a, b) => a.month == b.month ? d3.ascending(a.day, b.day) : d3.ascending(a.month, b.month))
        .rollup(d => { return { event: d[0].event, date: d[0].date, count: d.length, leapCount: d.filter(dd => dd.leap).length, nonLeapCount: d.filter(dd => !dd.leap).length, freq: d.length/totalYears } })
        .map(rawData.filter(d => d.year >= startYear && d.year <= endYear));

    histY.domain([0, d3.max(aggData.values().map(d => d3.max(d.values(), dd => dd.count)))]); // renormalize
}

function makeDateRange(start, stop, dates) {
    let startMonth, startDay,
        stopMonth, stopDay;
    if(start) {
        startMonth = start.getUTCMonth(),
        startDay = start.getUTCDate();
    }
    else {
        startMonth = 0,
        startDay = 1;
    }

    if(stop) {
        stopMonth = stop.getUTCMonth(),
        stopDay = stop.getUTCDate() + 1; // this function should be inclusive, so add 1 to stop
    }
    else {
        stopMonth = 11,
        stopDay = 32;
    }
    // pick a gregorian leap year (2016) and use D3 to do the hard work

    let range = d3.utcDay.range(Date.UTC(2016, startMonth, startDay), Date.UTC(2016, stopMonth, stopDay));
    if(dates) return range;
    else return range.map(d => (d.getUTCMonth() + 1) + "-" + d.getUTCDate());
}
