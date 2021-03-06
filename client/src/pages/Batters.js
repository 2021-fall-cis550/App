/* eslint-disable react-hooks/exhaustive-deps */
import React, {useState, useEffect} from 'react';
import NavBar from '../components/NavBar';
import '../stylesheets/Head2HeadTeams.css';
import { Dropdown } from 'semantic-ui-react'
import Plot from 'react-plotly.js';

const lib = require('../fetcher.js');

function Batters() {
    const dates = ["2011-09-25", "2012-09-25", "2013-09-25", "2014-09-25", "2015-09-25"];
    const [batters, setBatters] = useState([]);
    const [teams, setTeams] = useState([]);
    const [battingData, setBattingData] = useState([]);
    const [againstTeam, setAgainstTeam] = useState(-1);
    const [stat, setStat] = useState('Homeruns');
    const [isLoading, setIsLoading] = useState(false);
    const [pitchHand, setPitchHand] = useState('');

    const [selectedBatters, setSelectedBatters] = useState([]);

    useEffect(async () => {
        const batters = await lib.getBatters();
        const res_bat= batters.result.map((p) => ({key: p.ID, value: p.ID, text: p.FirstName + " " + p.LastName}));
        const t = await lib.getTeams();
        const res_teams = t.data.map((t) => ({key: t[0], value: t[0], text: t[1]}));
        setTeams(res_teams);
        setBatters(res_bat);
        setIsLoading(false);
    }, []);

    useEffect(async () => {
        let data = {};
        let player = {};
        const start_end = [["2011-01-01", "2012-01-01"], ["2012-01-01", "2013-01-01"], 
                        ["2013-01-01", "2014-01-01"], ["2014-01-01", "2015-01-01"], ["2015-01-01", "2016-01-01"]]
        for (let id of selectedBatters) {
            data[id[0]] = [];
            player[id[0]] = id[1];
            for (let date of start_end) {
                const res = await lib.getBatterStats(id[0], date[0], date[1], againstTeam, pitchHand);
                data[id[0]].push(res.result);
            }
        }
        let allData = [];
        for (const [key, value] of Object.entries(data)) {
            const s = data[key].map((e) => e[stat]);
            allData.push({name: player[key], pid: key, statistics: s});
        }

        const plotData = allData.map((d) => ({
            x: dates,
            y:d.statistics,
            type: "scatter",
            mode: "lines+markers",
            name: d.name,
        }));
        setBattingData(plotData);

    }, [selectedBatters, stat, againstTeam, pitchHand]);

    useEffect(() => {

    }, [battingData]);

    function handleBatterChange(event, data) {
        let temp = [];
        for (let i = 0; i < data.value.length; i++) {
            const name = batters.find(o => o.value === data.value[i]).text;
            temp.push([data.value[i], name]);
        }
        setSelectedBatters(temp);
    }

    function handleStatChange(event, data) {
        setStat(data.value);
    }

    function handleTeamChange(event, data) {
        setAgainstTeam(data.value);
    }

    function handleHandChange(event, data) {
        setPitchHand(data.value);
    }
    return (
        !isLoading && 
        (
        <div>
            <NavBar />
            <div className="selection">
            <Dropdown
                style={{width: '500px', height: '10px', marginRight: '10px'}}
                placeholder='Add a Batter'
                fluid
                multiple
                search
                selection
                options={batters}
                onChange={handleBatterChange}
            />
            <Dropdown
                    style={{width: '200px', height: '10px', marginRight: '10px'}}
                    placeholder='Select a stat to view'
                    fluid
                    search
                    selection
                    onChange={handleStatChange}
                    options={[{key: 1, value: 'Homeruns', text: 'Homeruns'},
                              {key: 2, value: 'Singles', text: 'Singles'},
                              {key: 3, value: 'Doubles', text: 'Doubles'},
                              {key: 4, value: 'Triples', text: 'Triples'}, 
                              {key: 5, value: 'Walks', text: 'Walks'},
                              {key: 6, value: 'BattingAvg', text: 'Batting Avg.'}]}
              />
              <Dropdown
                    style={{width: '200px', height: '10px', marginRight: '10px'}}
                    placeholder='Select an against team'
                    fluid
                    search
                    selection
                    options={[{key: -1, text:'All' , value: -1}, ...teams]}
                    onChange={handleTeamChange}
              />
              <Dropdown
                    style={{width: '200px', height: '10px', marginRight: '10px'}}
                    placeholder='Select handedness'
                    fluid
                    search
                    selection
                    options={[{key: 1, text: 'Both', value: ''}, {key: 2, text: 'Right', value: 'R'}, {key: 3, text: 'Left', value: 'L'}]}
                    onChange={handleHandChange}
              />
            </div>
            <div>
            <Plot style={{marginLeft: '15%'}}
                data={battingData}
                config={{displayModeBar: false}}
                layout={ {width: 1000, height: 500, title: 'Stats Over 2011-2015', showlegend: true, 
                    xaxis: {
                    title: {
                      text: 'Year',} }, 
                    yaxis: {
                        title: {
                          text: `${stat}`,} },
                          plot_bgcolor:'rgba(0, 0, 0, 0.85)'
                    }
                    }
            />
            </div>
        </div>
        )
    );
}

export default Batters;