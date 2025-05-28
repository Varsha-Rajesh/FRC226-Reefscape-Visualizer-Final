/*-----VARIABLES----*/

const charts = {
  autoCoral: null,
  autoAlgae: null,
  teleCoral: null,
  teleAlgae: null,
  endGame: null,
  overviewStackedChart: null,
  coralCyclesChart: null,
  algaeCyclesChart: null,
  epaTrendChart: null,
  epaTrendChartTeam1: null,
  epaTrendChartTeam2: null
};

let pitScoutingData = [];
let tbaClimbData = {};
let coralMismatchData = [];
let hiddenTeams = [];
let showHiddenTeamsInFilter = false;
let highlightedOverviewTeam = null;
let csvText = localStorage.getItem('csvText') || "";
let pitCsvText = localStorage.getItem('pitCsvText') || "";

async function handleDataUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('dataFile');
  const statusEl = document.getElementById('statusData');
  const file = fileInput.files[0];
  if (!file || !file.name.endsWith('.csv')) {
    statusEl.textContent = 'Please upload a valid .csv file.';
    return;
  }
  const reader = new FileReader();
  reader.onload = function (evt) {
    csvText = evt.target.result;
    localStorage.setItem('csvText', csvText);
    statusEl.textContent = 'Event CSV uploaded!';
  };
  reader.readAsText(file);
}

document.getElementById('submitData').addEventListener('click', handleDataUpload);

async function handlePitUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('pitFile');
  const statusEl = document.getElementById('statusPit');
  const file = fileInput.files[0];
  if (!file || !file.name.endsWith('.csv')) {
    statusEl.textContent = 'Please upload a valid .csv file.';
    return;
  }
  const reader = new FileReader();
  reader.onload = function (evt) {
    pitCsvText = evt.target.result;
    localStorage.setItem('pitCsvText', pitCsvText);
    statusEl.textContent = 'Pit CSV uploaded!';
  };
  reader.readAsText(file);
}
document.getElementById('submitPit').addEventListener('click', handlePitUpload);
document.getElementById('submitPit').addEventListener('click', handlePitUpload);

function deleteFile(type) {
  if (type === 'dataFile') {
    csvText = "";
    localStorage.removeItem('csvText');
    document.getElementById('dataFile').value = "";
    document.getElementById('statusData').textContent = "Event CSV deleted.";
  } else if (type === 'pitFile') {
    pitCsvText = "";
    localStorage.removeItem('pitCsvText');
    document.getElementById('pitFile').value = "";
    document.getElementById('statusPit').textContent = "Pit CSV deleted.";
  }
}

/*-----DEFENSE RANKING FUNCTIONS----*/
function calculateDefenseRankings(data) {
  const matches = {};
  const teamMatches = {};
  const robotDiedMap = {};

  data.forEach(row => {
    const match = row['Match'];
    const teamNumber = row['Team No.'];
    const died = row['Died or Immobilized'] === '1';

    if (match && teamNumber) {
      if (!robotDiedMap[match]) {
        robotDiedMap[match] = new Set();
      }
      if (died) {
        robotDiedMap[match].add(teamNumber);
      }
    }
  });

  data.forEach(row => {
    const match = row['Match'];
    const teamNumber = row['Team No.'];
    const robotColor = row['Robot Color'];
    const totalScore = parseFloat(row['Total Score']) || 0;

    if (!match || !teamNumber || !robotColor) return;

    if (!matches[match]) {
      matches[match] = { red: [], blue: [] };
    }

    const alliance = robotColor.toLowerCase().startsWith('red') ? 'red' : 'blue';
    matches[match][alliance].push({ teamNumber, totalScore });

    if (!teamMatches[teamNumber]) {
      teamMatches[teamNumber] = [];
    }
    teamMatches[teamNumber].push({ match, alliance, totalScore });
  });

  const allianceEPAs = {};
  const teamDefenseImpact = {};
  const defenseMatchCount = {};

  Object.entries(matches).forEach(([match, { red, blue }]) => {
    if (red.length !== 3 || blue.length !== 3) return;

    const redEPA = red.reduce((sum, t) => sum + t.totalScore, 0);
    const blueEPA = blue.reduce((sum, t) => sum + t.totalScore, 0);

    allianceEPAs[match] = { redEPA, blueEPA };
  });

  data.forEach(row => {
    const teamNumber = row['Team No.'];
    const match = row['Match'];
    const robotColor = row['Robot Color'];
    const defenseRating = parseFloat(row['Defense Rating']);

    if (!match || !teamNumber || isNaN(defenseRating) || defenseRating <= 0) return;

    const isRed = robotColor.toLowerCase().startsWith('red');
    const defendingAgainst = isRed ? 'blue' : 'red';

    const thisMatch = matches[match];
    if (!thisMatch || thisMatch.red.length !== 3 || thisMatch.blue.length !== 3) return;

    const diedRobots = robotDiedMap[match] || new Set();
    const opponentTeams = thisMatch[defendingAgainst].map(t => t.teamNumber);
    const anyOpponentDied = opponentTeams.some(team => diedRobots.has(team));
    if (anyOpponentDied) return;

    const opponentEPAInMatch = allianceEPAs[match][`${defendingAgainst}EPA`];

    let totalOpponentEPA = 0;
    let opponentMatchCount = 0;

    opponentTeams.forEach(opponent => {
      const games = teamMatches[opponent];
      games.forEach(g => {
        if (g.match !== match) {
          const comparisonDiedRobots = robotDiedMap[g.match] || new Set();
          if (!comparisonDiedRobots.has(opponent)) {
            const allianceScore = allianceEPAs[g.match]?.[`${g.alliance}EPA`];
            if (!isNaN(allianceScore)) {
              totalOpponentEPA += allianceScore;
              opponentMatchCount++;
            }
          }
        }
      });
    });

    if (opponentMatchCount === 0) return;

    const avgOpponentEPA = totalOpponentEPA / opponentMatchCount;
    const impact = avgOpponentEPA - opponentEPAInMatch;

    if (!teamDefenseImpact[teamNumber]) {
      teamDefenseImpact[teamNumber] = 0;
      defenseMatchCount[teamNumber] = 0;
    }

    teamDefenseImpact[teamNumber] += impact;
    defenseMatchCount[teamNumber]++;
  });

  const rankings = Object.keys(teamDefenseImpact).map(team => {
    const matches = defenseMatchCount[team];
    return {
      team,
      avgImpact: matches > 0 ? teamDefenseImpact[team] / matches : 0,
      matchesCount: matches
    };
  });

  rankings.sort((a, b) => b.avgImpact - a.avgImpact);
  rankings.forEach((entry, i) => entry.rank = i + 1);

  return rankings;
}
let defenseRankings = [];

function updateDefenseRankings(data) {
  defenseRankings = calculateDefenseRankings(data);
  renderDefenseRankingTable();

}

function renderDefenseRankingTable() {
  const tableBody = document.getElementById('defenseRankingTableBody');
  tableBody.innerHTML = '';

  if (!defenseRankings || defenseRankings.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" style="padding: 8px; text-align: center; color: #aaa;">
          No defense data available. Upload match data first.
        </td>
      </tr>
    `;
    return;
  }

  defenseRankings.forEach(team => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="padding: 8px; border-bottom: 1px solid #2a2d31;">${team.rank}</td>
      <td style="padding: 8px; border-bottom: 1px solid #2a2d31;">${team.team}</td>
      <td style="padding: 8px; border-bottom: 1px solid #2a2d31;">${team.avgImpact.toFixed(1)}</td>
    `;
    tableBody.appendChild(row);
  });
}


/*-----UTILITY FUNCTIONS----*/

function parseCSV() {
  return Papa.parse(csvText, { header: true });
}

function destroyChart(chartName) {
  if (charts[chartName]) {
    charts[chartName].destroy();
    charts[chartName] = null;
  }
}

function createChart(ctx, type, data, options) {
  return new Chart(ctx, { type, data, options });
}

function getChartOptions(stacked = false, stepSize = 1) {
  return {
    responsive: true,
    devicePixelRatio: 3,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1C1E21',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#000',
        borderWidth: 1,
        titleFont: { family: 'Lato', size: 14 },
        bodyFont: { family: 'Lato', size: 14 },
        padding: 10
      }
    },
    scales: {
      x: {
        stacked: stacked,
        ticks: {
          color: 'white',
          font: { family: 'Lato', size: 12, weight: 'bold' }
        }
      },
      y: {
        stacked: stacked,
        beginAtZero: true,
        ticks: {
          color: 'white',
          stepSize: stepSize,
          font: { family: 'Lato', size: 14, weight: 'bold' }
        }
      }
    }
  };
}


/*-----EVENT LISTENERS----*/

// Tab Navigation
function showTab(event, tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(button => button.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.currentTarget.classList.add('active');
  document.querySelector('.content').scrollTo({ top: 0, behavior: 'auto' });
}

// Individual View
document.getElementById('search').addEventListener('click', searchTeam);
document.getElementById('teamSearch').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    searchTeam();
  }
});
document.getElementById('algaeTypeFilter').addEventListener('change', function () {
  const value = this.value;
  const teamNumber = document.getElementById('teamSearch').value.trim();
  if (!teamNumber) return;

  const data = filterTeamData(teamNumber);
  renderTeleAlgaeChartFiltered(data, value);
});

document.getElementById('hideEPAAvg').addEventListener('change', function () {
  toggleEPAAvg('epaTrendChart', this.checked);
});

// CSV Upload
document.getElementById('submitData').addEventListener('click', handleDataUpload);
document.getElementById('submitPit').addEventListener('click', function (e) {
  e.preventDefault();
  handlePitUpload('pitFile', 'statusPit');
});
// TBA Verification
document.getElementById('verifyWithTBABtn').addEventListener('click', getTBAData);
document.getElementById('updateClimbsBtn').addEventListener('click', updateClimbs);

// Rescout Table
document.getElementById('rescoutFilter').addEventListener('change', filterRescoutTable);
document.getElementById('hideCoralMismatch').addEventListener('change', filterRescoutTable);


// Filter Teams
document.getElementById('addHideTeamButton').addEventListener('click', addHiddenTeam);
document.getElementById('resetHideTeamButton').addEventListener('click', resetHiddenTeams);
document.getElementById('toggleHiddenTeamsButton').addEventListener('click', toggleHiddenTeams);
document.querySelectorAll('#filterCheckboxesContainer input[type="checkbox"]').forEach(checkbox => {
  checkbox.addEventListener('change', applyFilters);
});
document.getElementById('filterTeamsDropdown').addEventListener('change', applyFilters);

// Chart Filters
document.getElementById('chartFilterDropdown').addEventListener('change', updateOverviewCharts);
document.querySelectorAll('#startingPositionFilter').forEach(dropdown => {
  dropdown.addEventListener('change', function () {
    syncDropdowns(this.value);
    const algaeFilter = document.getElementById('algaeTypeFilter').value;
    filterAndRenderCharts(this.value);
    document.getElementById('algaeTypeFilter').value = algaeFilter;
  });
});
document.getElementById('algaeTypeFilter1').addEventListener('change', function () {
  syncAlgaeDropdownsAndFilter(this.value);
});

document.getElementById('algaeTypeFilter2').addEventListener('change', function () {
  syncAlgaeDropdownsAndFilter(this.value);
})

// Comparison View
document.getElementById('comparisonSearch1').addEventListener('change', searchComparisonBothTeams);
document.getElementById('comparisonSearch1').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    searchComparisonBothTeams();
  }
});
document.getElementById('comparisonSearch2').addEventListener('change', searchComparisonBothTeams);
document.getElementById('comparisonSearch2').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    searchComparisonBothTeams();
  }
});
/*document.getElementById('comparisonSearch1').addEventListener('input', function() {
  const teamNumber = this.value.trim();
  displayTeamNickname(teamNumber, 'teamNameDisplay1');
});

document.getElementById('comparisonSearch2').addEventListener('input', function() {
  const teamNumber = this.value.trim();
  displayTeamNickname(teamNumber, 'teamNameDisplay2');
});*/
document.querySelectorAll('.hideEPAAvgComparison').forEach(checkbox => {
  checkbox.addEventListener('change', function () {
    const isChecked = this.checked;
    document.querySelectorAll('.hideEPAAvgComparison').forEach(cb => {
      cb.checked = isChecked;
    });
    toggleEPAAvg('epaTrendTeam1', isChecked);
    toggleEPAAvg('epaTrendTeam2', isChecked);
  });
});

// Overview
document.getElementById('overviewSearch').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    handleOverviewSearch();
  }
});

document.querySelector('.tab[onclick*="defenseRankingInfo"]').addEventListener('click', function () {
  renderDefenseRankingTable();
});


/*-----FILE UPLOAD-----*/

async function uploadFile(fileInputId, statusId, uploadType) {
  const fileInput = document.getElementById(fileInputId);
  const statusEl = document.getElementById(statusId);
  const file = fileInput.files[0];

  if (!file || !file.name.endsWith(".csv")) {
    statusEl.textContent = "Please upload a valid .csv file.";
    return;
  }

  const reader = new FileReader();
  reader.onload = e => csvText = e.target.result;
  reader.readAsText(file);

  try {
    const formData = new FormData();
    formData.append('dataFile', file);
    formData.append('uploadType', uploadType);

    const response = await fetch('/uploads', { method: 'POST', body: formData });

    statusEl.textContent = reponse.message
      ? `File uploaded successfully as "${response.filename}"`
      : `Error: ${reponse.error || 'Unknown error'}`;
  } catch (err) {
    statusEl.textContent = `Successful upload`;
  }
}

function getLatestMatchNumber(data) {
  const matches = data.map(row => parseInt(row['Match'])).filter(n => !isNaN(n));
  return matches.length > 0 ? Math.max(...matches) : null;
}
async function handleDataUpload(e) {
  e.preventDefault();
  uploadFile('dataFile', 'statusData', 'csvData').then(() => {
    const parsedData = parseCSV();
    renderOverviewStackedChart(parsedData.data, 'all');
    renderCoralCyclesChart(parsedData.data);
    renderAlgaeCyclesChart(parsedData.data);
    renderRescoutTable(parsedData.data);
    updateDefenseRankings(parsedData.data);
    applyFilters();

    document.getElementById('rescoutFilter').value = 'all';

    const latestMatch = getLatestMatchNumber(parsedData.data);
    if (latestMatch) {
      document.getElementById('latestMatchInfoSidebar').textContent = `Data up till Q${latestMatch}`;
    }
  });
};

async function handlePitUpload(fileInputId, statusId) {
  const fileInput = document.getElementById(fileInputId);
  const statusEl = document.getElementById(statusId);
  const file = fileInput.files[0];

  if (!file || !file.name.endsWith(".csv")) {
    statusEl.textContent = "Please upload a valid .csv file.";
    return;
  }

  try {
    const formData = new FormData();
    formData.append('dataFile', file);
    formData.append('uploadType', 'csvPitScouting');

    const text = await file.text();
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transform: (value, header) => {
        const normalizedHeader = header.trim();
        if (normalizedHeader === 'Ground Barge' || normalizedHeader === 'Ground Processor') {
          return value === '1';
        }
        return value;
      }
    });

    pitScoutingData = result.data.filter(row => {
      return row['Team No.'] &&
        (row['Ground Barge'] !== undefined) &&
        (row['Ground Processor'] !== undefined);
    });

    statusEl.textContent = `Successfully loaded pit data for ${pitScoutingData.length} teams`;

    const currentTeam = document.getElementById('teamSearch').value.trim();
    if (currentTeam) {
      const teamData = filterTeamData(currentTeam);
      if (teamData.length > 0) {
        renderTeamStatistics(teamData, pitScoutingData);
      }
    }

    const comparisonTeam1 = document.getElementById('comparisonSearch1').value.trim();
    const comparisonTeam2 = document.getElementById('comparisonSearch2').value.trim();

    if (comparisonTeam1) {
      const team1Data = filterTeamData(comparisonTeam1);
      if (team1Data.length > 0) {
        renderComparisonTeamStatistics(team1Data, pitScoutingData, 1);
      }
    }

    if (comparisonTeam2) {
      const team2Data = filterTeamData(comparisonTeam2);
      if (team2Data.length > 0) {
        renderComparisonTeamStatistics(team2Data, pitScoutingData, 2);
      }
    }

    applyFilters();
  } catch (error) {
    statusEl.textContent = "Error: " + error.message;
    pitScoutingData = [];
  }
}

async function deleteFile(fileType) {
  const filename = fileType === 'dataFile' ? 'data.csv' : 'pit_scouting.csv';
  const statusId = fileType === 'dataFile' ? 'statusData' : 'statusPit';
  const fileInputId = fileType === 'dataFile' ? 'dataFile' : 'pitFile';

  try {
    const response = await fetch(`/uploads/${filename}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      document.getElementById(fileInputId).value = '';
      document.getElementById(statusId).textContent = 'File deleted successfully';

      if (fileType === 'dataFile') {
        clearAllCharts();
        clearRescoutTable();
      } else if (fileType === 'pitFile') {
        pitScoutingData = [];

        const currentTeam = document.getElementById('teamSearch').value.trim();
        if (currentTeam) {
          const teamData = filterTeamData(currentTeam);
          if (teamData.length > 0) {
            renderTeamStatistics(teamData, []);
          }
        }

        const comparisonTeam1 = document.getElementById('comparisonSearch1').value.trim();
        const comparisonTeam2 = document.getElementById('comparisonSearch2').value.trim();

        if (comparisonTeam1) {
          const team1Data = filterTeamData(comparisonTeam1);
          if (team1Data.length > 0) {
            renderComparisonTeamStatistics(team1Data, [], 1);
          }
        }

        if (comparisonTeam2) {
          const team2Data = filterTeamData(comparisonTeam2);
          if (team2Data.length > 0) {
            renderComparisonTeamStatistics(team2Data, [], 2);
          }
        }
      }
    } else {
      document.getElementById(fileInputId).value = '';
      document.getElementById(statusId).textContent = 'File deleted successfully';

      if (fileType === 'dataFile') {
        clearAllCharts();
        clearRescoutTable();
      } else if (fileType === 'pitFile') {
        pitScoutingData = [];
      }
    }
  } catch (error) {
    document.getElementById(fileInputId).value = '';
    document.getElementById(statusId).textContent = 'File deleted successfully';

    if (fileType === 'dataFile') {
      clearAllCharts();
      clearRescoutTable();
    } else if (fileType === 'pitFile') {
      pitScoutingData = [];
    }
  }
}


function clearAllCharts() {
  if (charts['overviewStackedChart']) {
    charts['overviewStackedChart'].destroy();
    charts['overviewStackedChart'] = null;
  }
  if (charts['coralCyclesChart']) {
    charts['coralCyclesChart'].destroy();
    charts['coralCyclesChart'] = null;
  }
  if (charts['algaeCyclesChart']) {
    charts['algaeCyclesChart'].destroy();
    charts['algaeCyclesChart'] = null;
  }
  if (charts['epaTrendChart']) {
    charts['epaTrendChart'].destroy();
    charts['epaTrendChart'] = null;
  }
  if (charts['epaTrendChartTeam1']) {
    charts['epaTrendChartTeam1'].destroy();
    charts['epaTrendChartTeam1'] = null;
  }
  if (charts['epaTrendChartTeam2']) {
    charts['epaTrendChartTeam2'].destroy();
    charts['epaTrendChartTeam2'] = null;
  }

  Object.keys(charts).forEach(chartName => {
    if (charts[chartName]) {
      charts[chartName].destroy();
      charts[chartName] = null;
    }
  });



  document.getElementById('teamSearch').value = '';
  document.getElementById('flaggedMatches').innerHTML = '';
  document.getElementById('scouterComments').innerHTML = '';

  const statElements = [
    'climbSuccessRate', 'robotDiedRate', 'groundBarge', 'groundProcessor',
    'averageEPA', 'averageCoral', 'averageAlgae', 'maxCoral', 'maxCoralMatch',
    'maxAlgae', 'maxAlgaeMatch'
  ];

  statElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = id.includes('Rate') || id.includes('average') ? '0.00' :
        id.includes('max') ? '0' :
          id.includes('ground') ? '❌' : '';
    }
  });

  document.getElementById('comparisonSearch1').value = '';
  document.getElementById('comparisonSearch2').value = '';
}


/*-----TBA DATA FETCHING-----*/

async function getTBAData() {
  const eventKey = document.getElementById('tbaEventKey').value.trim();
  if (!eventKey) {
    document.getElementById('tbaStatus').textContent = 'Please enter an event key';
    return;
  }

  if (!csvText || csvText.trim() === "") {
    document.getElementById('tbaStatus').textContent = 'Please upload match data CSV first';
    return;
  }

  document.getElementById('tbaStatus').textContent = 'Fetching and comparing data...';

  try {
    const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${eventKey}/matches`, {
      headers: {
        'X-TBA-Auth-Key': 'dkHdbc90y6rrKoG7w15O2YsLW3bWKySKjDItw93b8benEh0ZtNDTK4hYRseZnsT3'
      }
    });

    if (!response.ok) {
      throw new Error(`TBA API error: ${response.status}`);
    }

    const matches = await response.json();
    const parsedCsv = parseCSV();

    tbaClimbData = processTbaClimbData(matches);
    coralMismatchData = verifyCoralCounts(matches, parsedCsv.data);

    if (coralMismatchData.length > 0) {
      document.getElementById('tbaStatus').textContent =
        `Found ${coralMismatchData.length} coral mismatch(es)`;
    } else {
      document.getElementById('tbaStatus').textContent = 'No coral mismatches found';
    }

    renderRescoutTable(parsedCsv.data);
    document.getElementById('tbaStatus').textContent = 'Verification complete!';
  } catch (error) {
    document.getElementById('tbaStatus').textContent = `Error: ${error.message}`;
  }
}

function matchKeyToTeams(matchKey, data, alliance) {
  const matchNum = matchKey.split('_qm')[1];
  return data
    .filter(row => row['Match'] === matchNum && row['Robot Color'].toLowerCase().startsWith(alliance))
    .map(row => row['Team No.']);
}

function verifyCoralCounts(matches, csvData) {
  const allianceMismatches = {};
  const csvMatchMap = {};
  csvData.forEach(row => {
    const match = row['Match'];
    if (!match) return;

    const robotColor = String(row['Robot Color'] || '').trim();
    let alliance = null;

    if (robotColor.startsWith('Red-')) alliance = 'red';
    else if (robotColor.startsWith('Blue-')) alliance = 'blue';

    if (alliance) {
      if (!csvMatchMap[match]) csvMatchMap[match] = { red: [], blue: [] };
      csvMatchMap[match][alliance].push(row);
    }
  });

  matches.forEach(match => {
    if (match.comp_level !== "qm") return;

    ["red", "blue"].forEach(alliance => {
      const breakdown = match.score_breakdown?.[alliance];
      if (!breakdown) return;

      const expected =
        (breakdown.autoReef?.trough || 0) +
        (breakdown.teleopReef?.tba_botRowCount || 0) +
        (breakdown.teleopReef?.tba_midRowCount || 0) +
        (breakdown.teleopReef?.tba_topRowCount || 0) +
        (breakdown.teleopReef?.trough || 0);

      let actual = 0;
      const csvRows = csvMatchMap[match.match_number]?.[alliance] || [];

      csvRows.forEach(row => {
        actual += parseInt(row['Auton L1'] || 0);
        actual += parseInt(row['Auton L2'] || 0);
        actual += parseInt(row['Auton L3'] || 0);
        actual += parseInt(row['Auton L4'] || 0);
        actual += parseInt(row['L1'] || 0);
        actual += parseInt(row['L2'] || 0);
        actual += parseInt(row['L3'] || 0);
        actual += parseInt(row['L4'] || 0);
      });

      const difference = Math.abs(expected - actual);
      if (difference >= 1) {
        const matchKey = `Q${match.match_number}-${alliance}`;
        allianceMismatches[matchKey] = {
          match: match.match_number,
          alliance: alliance,
          expected: expected,
          actual: actual,
          difference: difference,
          reason: `Coral: Scouting shows ${actual}, TBA shows ${expected} (${difference} off)`,
          type: 'coral'
        };
      }
    });
  });
  return Object.values(allianceMismatches);
}
const rescoutFilter = document.getElementById('rescoutFilter');
const hideCoralCheckbox = document.getElementById('hideCoralMismatch');

rescoutFilter.addEventListener('change', function () {
  const selectedFilter = this.value;

  if (selectedFilter === 'climb' || selectedFilter === 'others') {
    hideCoralCheckbox.checked = false;
  }
  filterCoralData();
});

hideCoralCheckbox.addEventListener('change', function () {
  const currentFilter = rescoutFilter.value;
  if (currentFilter === 'all' || currentFilter === 'coral') {
    filterCoralData();
  }
});

function filterCoralData() {
  const tableBody = document.getElementById('rescoutBody');
  const currentFilter = rescoutFilter.value;
  let filteredRows = window.rescoutData || [];

  if (currentFilter !== 'all') {
    filteredRows = filteredRows.filter(row => row.type === currentFilter);
  }


  if (hideCoralCheckbox.checked && (currentFilter === 'all' || currentFilter === 'coral')) {
    filteredRows = filteredRows.filter(row =>
      row.type !== 'coral' || row.difference >= 3
    );
  }

  tableBody.innerHTML = filteredRows.length === 0 ?
    '<tr><td colspan="3" style="text-align: center; padding: 12px; color: #888;font-style: italic;">No Matches to Rescout</td></tr>' :
    filteredRows.sort((a, b) => parseInt(a.match, 10) - parseInt(b.match, 10))
      .map(({ match, team, reason }) => `
          <tr>
            <td style="padding: 8px;">Q${match}</td>
            <td style="padding: 8px;">${team}</td>
            <td style="padding: 8px;">${reason}</td>
          </tr>
        `).join('');
}

function processTbaClimbData(matches) {
  const climbData = {};
  const qualMatches = matches.filter(match => match.comp_level === 'qm');

  qualMatches.forEach(match => {
    const matchKey = match.match_number.toString();
    climbData[matchKey] = {};

    match.alliances.red.team_keys.forEach((teamKey, idx) => {
      const teamNumber = teamKey.replace('frc', '');
      const climbStatus = match.score_breakdown?.red?.[`endGameRobot${idx + 1}`] || "Unknown";
      climbData[matchKey][teamNumber] = mapTbaClimbStatus(climbStatus);
    });

    match.alliances.blue.team_keys.forEach((teamKey, idx) => {
      const teamNumber = teamKey.replace('frc', '');
      const climbStatus = match.score_breakdown?.blue?.[`endGameRobot${idx + 1}`] || "Unknown";
      climbData[matchKey][teamNumber] = mapTbaClimbStatus(climbStatus);
    });
  });

  return climbData;
}

function mapTbaClimbStatus(tbaStatus) {
  switch (tbaStatus) {
    case 'DeepCage': return 12;
    case 'ShallowCage': return 6;
    case 'Parked': return 2;
    case 'None': return 0;
  }
}

function classifyScoutClimb(score) {
  if (score >= 11.5) return 12;
  if (score >= 5.5 && score <= 7) return 6;
  if (score >= 1.8 && score <= 2.2) return 2;
  return 0;
}

function getClimbName(score) {
  if (score >= 11.5) return 'Deep Climb';
  if (score >= 5.5 && score <= 7) return 'Shallow Climb';
  if (score >= 1.8 && score <= 2.2) return 'Parked';
  return 'No Climb';
}
async function updateClimbs() {
  if (!csvText || !tbaClimbData || Object.keys(tbaClimbData).length === 0) {
    alert('Please verify climbs with TBA first and ensure data is loaded');
    return;
  }

  const parsed = Papa.parse(csvText, { header: true });
  const data = parsed.data;

  let changesMade = false;
  let updatedRows = 0;

  const changeLog = [];

  data.forEach(row => {
    const match = row['Match']?.toString();
    const team = row['Team No.']?.toString();

    if (!match || !team || !tbaClimbData[match] || tbaClimbData[match][team] === undefined) {
      return;
    }

    const scoutClimb = parseFloat(row['Climb Score'] || 0);
    const normalizedScoutClimb = classifyScoutClimb(scoutClimb);
    const tbaClimb = tbaClimbData[match][team];

    if (Math.abs(normalizedScoutClimb - tbaClimb) > 1) {
      changesMade = true;
      updatedRows++;

      const oldClimbScore = parseFloat(row['Climb Score'] || 0);
      let newClimbScore;

      if (tbaClimb === 2) {
        newClimbScore = scoutClimb > 2 ? 2.1 : 2;
      } else {
        newClimbScore = tbaClimb;
      }

      const oldTotalScore = parseFloat(row['Total Score'] || 0);
      const newTotalScore = Math.round(oldTotalScore + oldClimbScore - newClimbScore);

      changeLog.push({
        'Qual Match': match,
        'Robot': team,
        'Scouter Input': normalizedScoutClimb,
        'TBA': tbaClimb,
        'Final': newClimbScore
      });
      row['Climb Score'] = newClimbScore.toString();
      row['Total Score'] = newTotalScore.toString();
    }
  });

  if (!changesMade) {
    alert('No climb discrepancies found - no changes needed');
    return;
  }

  const updatedCsv = Papa.unparse(data);

  const blob = new Blob([updatedCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'updated_scouting_data.csv');
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (changeLog.length > 0) {
    const changeLogCsv = Papa.unparse(changeLog);
    const blobLog = new Blob([changeLogCsv], { type: 'text/csv;charset=utf-8;' });
    const logUrl = URL.createObjectURL(blobLog);
    const logLink = document.createElement('a');
    logLink.setAttribute('href', logUrl);
    logLink.setAttribute('download', 'climb_change_log.csv');
    logLink.style.visibility = 'hidden';
    document.body.appendChild(logLink);
    logLink.click();
    document.body.removeChild(logLink);


    document.getElementById('downloadStatus').textContent = `Updated ${updatedRows} rows with climb data from TBA`;


  };
}

/*-----TBA TEAM DATA FETCHING-----*/

async function fetchTeamData(teamNumber) {
  try {
    const response = await fetch(`https://www.thebluealliance.com/api/v3/team/frc${teamNumber}`, {
      headers: {
        'X-TBA-Auth-Key': 'dkHdbc90y6rrKoG7w15O2YsLW3bWKySKjDItw93b8benEh0ZtNDTK4hYRseZnsT3'
      }
    });

    if (!response.ok) {
      throw new Error(`TBA API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching team data:', error);
    return null;
  }
}

function displayTeamNickname(teamNumber, elementId) {
  if (!teamNumber) {
    document.getElementById(elementId).textContent = '';
    return;
  }

  fetchTeamData(teamNumber).then(teamData => {
    const nickname = teamData?.nickname || '';
    document.getElementById(elementId).textContent = nickname;
  }).catch(() => {
    document.getElementById(elementId).textContent = '';
  });
}

/*-----RESCOUT TABLE----*/

function filterRescoutTable() {
  const tableBody = document.getElementById('rescoutBody');
  const filterType = document.getElementById('rescoutFilter').value;
  const hideSmallMismatches = document.getElementById('hideCoralMismatch').checked;

  let filteredRows = window.rescoutData || [];

  if (filterType !== 'all') {
    filteredRows = filteredRows.filter(row => row.type === filterType);
  }

  if (filterType === 'all' || filterType === 'coral') {
    if (hideSmallMismatches) {
      filteredRows = filteredRows.filter(row =>
        row.type !== 'coral' || (row.type === 'coral' && row.difference >= 3)
      );
    }
  }

  tableBody.innerHTML = '';

  if (filteredRows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; padding: 12px; color: #888; font-style: italic;">
          No Matches to Rescout
        </td>
      </tr>
    `;
    return;
  }

  filteredRows.sort((a, b) => parseInt(a.match, 10) - parseInt(b.match, 10))
    .forEach(({ match, team, reason }) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="padding: 8px;">Q${match}</td>
        <td style="padding: 8px;">${team}</td>
        <td style="padding: 8px;">${reason}</td>
      `;
      tableBody.appendChild(row);
    });
}

function renderRescoutTable(data) {
  const rescoutSection = document.getElementById('rescoutSection');
  const seenRows = new Set();
  const matchCounts = {};
  const rescoutRows = [];

  coralMismatchData.forEach(mismatch => {
    rescoutRows.push({
      match: mismatch.match,
      difference: mismatch.difference,
      team: `${mismatch.alliance.charAt(0).toUpperCase()}${mismatch.alliance.slice(1)}`,
      reason: mismatch.reason,
      type: 'coral'
    });
  });

  data.forEach(row => {
    const match = row['Match']?.toString().replace(/^Q/i, '');
    const team = row['Team No.']?.toString();
    const scoutClimb = Math.round(parseFloat(row['Climb Score'] || 0));
    const normalizedScoutClimb = classifyScoutClimb(scoutClimb);

    if (tbaClimbData[match] && tbaClimbData[match][team] !== undefined) {
      const tbaClimb = tbaClimbData[match][team];
      if (Math.abs(normalizedScoutClimb - tbaClimb) > 1) {
        rescoutRows.push({
          match,
          team,
          reason: `Climb: Scouted ${getClimbName(normalizedScoutClimb)}, TBA shows ${getClimbName(tbaClimb)}`,
          type: 'climb'
        });
      }
    }
  });
  function renderRescoutTable(data) {
    const rescoutSection = document.getElementById('rescoutSection');
    const seenRows = new Set();
    const matchCounts = {};
    const rescoutRows = [];

    coralMismatchData.forEach(mismatch => {
      rescoutRows.push({
        match: mismatch.match,
        difference: mismatch.difference,
        team: mismatch.alliance === 'red' ? 'Red' : 'Blue',
        reason: mismatch.reason,
        type: 'coral'
      });
    });

    data.forEach(row => {
      const match = row['Match']?.toString().replace(/^Q/i, '');
      const team = row['Team No.']?.toString();
      const scoutClimb = Math.round(parseFloat(row['Climb Score'] || 0));
      const normalizedScoutClimb = classifyScoutClimb(scoutClimb);

      if (tbaClimbData[match] && tbaClimbData[match][team] !== undefined) {
        const tbaClimb = tbaClimbData[match][team];
        if (Math.abs(normalizedScoutClimb - tbaClimb) > 1) {
          rescoutRows.push({
            match,
            team,
            reason: `Climb: Scouted ${getClimbName(normalizedScoutClimb)}, TBA shows ${getClimbName(tbaClimb)}`,
            type: 'climb'
          });
        }
      }
    });

    data.forEach(row => {
      const match = row['Match']?.toString().replace(/^Q/i, '');
      const team = row['Team No.']?.toString();
      const robotColor = row['Robot Color'];
      const matchKey = `${match}-${team}-${robotColor}`;

      if (seenRows.has(matchKey)) {
        rescoutRows.push({
          match,
          team,
          reason: 'Duplicate entry',
          type: 'others'
        });
      } else {
        seenRows.add(matchKey);
      }
    });

    Object.entries(matchCounts).forEach(([match, count]) => {
      if (count < 6) {
        const existingTeams = data
          .filter(row => row['Match'] === match)
          .map(row => row['Robot Color']);

        const allPositions = ['Red-1', 'Red-2', 'Red-3', 'Blue-1', 'Blue-2', 'Blue-3'];
        const missingPositions = allPositions.filter(pos => !existingTeams.includes(pos));

        missingPositions.forEach(pos => {
          rescoutRows.push({
            match: match.replace(/^Q/i, ''),
            team: pos,
            reason: `Missing data for ${pos}`,
            type: 'others'
          });
        });
      }
    });

    window.rescoutData = rescoutRows;
    filterRescoutTable();
  }

  data.forEach(row => {
    const matchKey = row['Match'];
    if (matchKey) {
      matchCounts[matchKey] = (matchCounts[matchKey] || 0) + 1;
    }
  });

  Object.entries(matchCounts).forEach(([match, count]) => {
    if (count < 6) {
      const existingTeams = data
        .filter(row => row['Match'] === match)
        .map(row => row['Robot Color']);

      const allPositions = ['Red-1', 'Red-2', 'Red-3', 'Blue-1', 'Blue-2', 'Blue-3'];
      const missingPositions = allPositions.filter(pos => !existingTeams.includes(pos));

      missingPositions.forEach(pos => {
        rescoutRows.push({
          match: match.replace(/^Q/i, ''),
          team: pos,
          reason: `Missing data for ${pos}`,
          type: 'others'
        });
      });
    }
  });

  window.rescoutData = rescoutRows;

  if (rescoutRows.length > 0) {
    rescoutSection.style.display = 'block';
    filterRescoutTable('all');
  } else {
    rescoutSection.style.display = 'block';
    const tableBody = document.getElementById('rescoutBody');
    tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 12px; color: #888;font-style: italic;">No Matches to Rescout</td></tr>';
  }
}

function clearRescoutTable() {
  const tableBody = document.getElementById('rescoutBody');
  tableBody.innerHTML = '';
}

/*-----INDIVIDUAL VIEW----*/


function searchTeam() {
  const teamNumber = document.getElementById('teamSearch').value.trim();
  let teamData = filterTeamData(teamNumber);

  const startingPosition = 'all';
  const algaeFilter = 'all';

  syncDropdowns(startingPosition);
  renderAutoCharts(teamData);
  renderTeleAlgaeChartFiltered(teamData, algaeFilter);
  renderTeleCharts(teamData);
  renderEndGameChart(teamData);
  renderQualitativeNotes(teamData);
  renderFlaggedMatches(teamData);
  renderTeamStatistics(teamData, pitScoutingData);
  renderEpaTrendChart(teamData, 'epaTrendChart');

  document.getElementById('startingPositionFilter').value = startingPosition;
  document.getElementById('algaeTypeFilter').value = algaeFilter;

  displayTeamNickname(teamNumber, 'teamNicknameDisplay');
}

function filterTeamData(teamNumber) {
  const parsed = parseCSV();
  return parsed.data.filter(row => row['Team No.'] === teamNumber);

}

function renderAutoCharts(data) {
  const sortedData = data.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));
  const matchLabels = sortedData.map(row => 'Q' + row.Match);

  destroyChart('autoCoral');
  charts.autoCoral = createChart(
    document.getElementById('autoCoral').getContext('2d'),
    'bar',
    {
      labels: matchLabels,
      datasets: [
        { label: 'L1', data: sortedData.map(row => parseInt(row['Auton L1'] || 0)), backgroundColor: '#3B064D' },
        { label: 'L2', data: sortedData.map(row => parseInt(row['Auton L2'] || 0)), backgroundColor: '#8105D8' },
        { label: 'L3', data: sortedData.map(row => parseInt(row['Auton L3'] || 0)), backgroundColor: '#ED0CEF' },
        { label: 'L4', data: sortedData.map(row => parseInt(row['Auton L4'] || 0)), backgroundColor: '#FF8BFC' }
      ]
    },

    getChartOptions(true)
  );

  destroyChart('autoAlgae');
  charts.autoAlgae = createChart(
    document.getElementById('autoAlgae').getContext('2d'),
    'bar',
    {
      labels: matchLabels,
      datasets: [
        { label: 'Removed', data: sortedData.map(row => parseInt(row['Auton Algae Removed'] || 0)), backgroundColor: '#002BFF' },
        { label: 'Net', data: sortedData.map(row => parseInt(row['Auton Algae in Net'] || 0)), backgroundColor: '#00D2F3' },
        { label: 'Processor', data: sortedData.map(row => parseInt(row['Auton Algae in Processor'] || 0)), backgroundColor: '#5cffd5' }
      ]
    },
    getChartOptions(true)
  );
}

function renderQualitativeNotes(data) {
  const scouterCommentsDiv = document.getElementById('scouterComments');

  scouterCommentsDiv.innerHTML = '';

  const notes = data
    .filter(row => row['Comments'] && row['Comments'].trim() !== '')
    .map(row => `Q${row.Match}: ${row['Comments']}`);

  if (notes.length > 0) {
    scouterCommentsDiv.innerHTML = notes.join('<hr style="border: 0; margin: 10px 0;">');
  } else {
    scouterCommentsDiv.innerHTML = 'No qualitative notes available for this team.';
  }
}

function renderTeleCharts(data) {
  const matchLabels = data.map(row => 'Q' + row.Match);
  const sortedData = data.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));

  const coralTotals = sortedData.map(row =>
    (parseInt(row['L1'] || 0)) +
    (parseInt(row['L2'] || 0)) +
    (parseInt(row['L3'] || 0)) +
    (parseInt(row['L4'] || 0))
  );

  const yMax = Math.max(...coralTotals, 0);
  const stepSize = yMax > 16 ? 4 : 2;
  const adjustedYMax = Math.ceil(yMax / stepSize) * stepSize;

  destroyChart('teleCoral');
  charts.teleCoral = createChart(
    document.getElementById('teleCoral').getContext('2d'),
    'bar',
    {
      labels: matchLabels,
      datasets: [
        { label: 'L1', data: sortedData.map(row => parseInt(row['L1'] || 0)), backgroundColor: '#3B064D' },
        { label: 'L2', data: sortedData.map(row => parseInt(row['L2'] || 0)), backgroundColor: '#8105D8' },
        { label: 'L3', data: sortedData.map(row => parseInt(row['L3'] || 0)), backgroundColor: '#ED0CEF' },
        { label: 'L4', data: sortedData.map(row => parseInt(row['L4'] || 0)), backgroundColor: '#FF8BFC' }
      ]
    },
    {
      ...getChartOptions(true, stepSize),
      scales: {
        ...getChartOptions(true, stepSize).scales,
        y: {
          ...getChartOptions(true, stepSize).scales.y,
          max: adjustedYMax
        }
      },
      plugins: {
        ...getChartOptions(true, stepSize).plugins,
        tooltip: {
          ...getChartOptions(true, stepSize).plugins.tooltip,
          callbacks: {
            afterBody: function (context) {
              const dataIndex = context[0].dataIndex;
              const row = sortedData[dataIndex];
              const total =
                (parseInt(row['L1'] || 0)) +
                (parseInt(row['L2'] || 0)) +
                (parseInt(row['L3'] || 0)) +
                (parseInt(row['L4'] || 0));
              return `Total Coral: ${total}`;
            }
          }
        }
      }
    }
  );

  destroyChart('teleAlgae');
  charts.teleAlgae = createChart(
    document.getElementById('teleAlgae').getContext('2d'),
    'bar',
    {
      labels: matchLabels,
      datasets: [
        { label: 'Removed', data: data.map(row => parseInt(row['Algae removed'] || 0)), backgroundColor: '#002BFF' },
        { label: 'Net', data: data.map(row => parseInt(row['Algae in Net'] || 0)), backgroundColor: '#00D2F3' },
        { label: 'Processor', data: data.map(row => parseInt(row['Algae in Processor'] || 0)), backgroundColor: '#5cffd5' }
      ]
    },
    getChartOptions(true, 2)
  );
}





function renderTeleAlgaeChartFiltered(data, filter) {
  const sortedData = data.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));
  let filteredRows;

  if (filter === 'remove') {
    filteredRows = sortedData.filter(row => parseInt(row['Algae removed'] || 0) > 0);
  } else if (filter === 'process') {
    filteredRows = sortedData.filter(row => parseInt(row['Algae in Processor'] || 0) > 0);
  } else if (filter === 'barge') {
    filteredRows = sortedData.filter(row => parseInt(row['Algae in Net'] || 0) > 0);
  } else {
    filteredRows = sortedData.filter(row =>
      parseInt(row['Algae removed'] || 0) > 0 ||
      parseInt(row['Algae in Processor'] || 0) > 0 ||
      parseInt(row['Algae in Net'] || 0) > 0
    );
  }

  if (filteredRows.length === 0) {
    renderBlankChart('teleAlgae', "No Data");
    return;
  }

  const matchLabels = filteredRows.map(row => 'Q' + row.Match);
  const datasets = [];

  if (filter === 'all' || filter === 'remove') {
    datasets.push({
      label: 'Removed',
      data: filteredRows.map(row => parseInt(row['Algae removed'] || 0)),
      backgroundColor: '#002BFF'
    });
  }

  if (filter === 'all' || filter === 'process') {
    datasets.push({
      label: 'Processor',
      data: filteredRows.map(row => parseInt(row['Algae in Processor'] || 0)),
      backgroundColor: '#5cffd5'
    });
  }

  if (filter === 'all' || filter === 'barge') {
    datasets.push({
      label: 'Net',
      data: filteredRows.map(row => parseInt(row['Algae in Net'] || 0)),
      backgroundColor: '#00D2F3'
    });
  }

  destroyChart('teleAlgae');
  charts.teleAlgae = createChart(
    document.getElementById('teleAlgae').getContext('2d'),
    'bar',
    { labels: matchLabels, datasets },
    getChartOptions(true, 2)
  );
}



function renderTeamStatistics(data, pitData) {
  const clearValue = (id, defaultValue = '') => {
    document.getElementById(id).textContent = defaultValue;
  };

  clearValue('climbSuccessRate', '0.00');
  clearValue('robotDiedRate', '0.00');
  clearValue('groundBarge');
  clearValue('groundProcessor');
  clearValue('averageEPA', '0.00');
  clearValue('averageCoral', '0.00');
  clearValue('averageAlgae', '0.00');
  clearValue('defenseRank', 'N/A')
  clearValue('maxCoral', '0');
  clearValue('maxCoralMatch', 'N/A');
  clearValue('maxAlgae', '0');
  clearValue('maxAlgaeMatch', 'N/A');

  if (!data || data.length === 0) return;

  const teamNumber = data[0]['Team No.'].toString().trim();

  let groundBarge = '';
  let groundProcessor = '';

  if (pitData && pitData.length > 0) {
    const teamPitData = pitData.find(team => {
      const pitTeamNumber = team['Team No.']?.toString().trim();
      return pitTeamNumber === teamNumber;
    });

    if (teamPitData) {
      if (teamPitData['Ground Barge'] !== undefined) {
        groundBarge = teamPitData['Ground Barge'] ? '✅' : '❌';
      }

      if (teamPitData['Ground Processor'] !== undefined) {
        groundProcessor = teamPitData['Ground Processor'] ? '✅' : '❌';
      }
    }
  }
  document.getElementById('groundBarge').textContent = groundBarge;
  document.getElementById('groundProcessor').textContent = groundProcessor;

  const climbScores = data.map(row => parseFloat(row['Climb Score'] || 0));
  const successfulClimbs = climbScores.filter(score => score === 12 || score === 6).length;
  const totalClimbAttempts = climbScores.filter(score => score === 12 || score === 6 || score === 2.1).length;
  const climbSuccessRate = totalClimbAttempts > 0 ? (successfulClimbs / totalClimbAttempts * 100).toFixed(1) : "0.00";
  const robotDiedRate = data.length > 0 ? (data.filter(row => row['Died or Immobilized'] === '1').length / data.length * 100).toFixed(1) : "0.00";

  document.getElementById('climbSuccessRate').textContent = climbSuccessRate;
  document.getElementById('robotDiedRate').textContent = robotDiedRate;


  const totalScore = data.reduce((sum, row) => sum + (parseFloat(row['Total Score']) || 0), 0);
  const totalCoral = data.reduce((sum, row) => {
    return sum +
      (parseInt(row['Auton L1']) || 0) +
      (parseInt(row['Auton L2']) || 0) +
      (parseInt(row['Auton L3']) || 0) +
      (parseInt(row['Auton L4']) || 0) +
      (parseInt(row['L1']) || 0) +
      (parseInt(row['L2']) || 0) +
      (parseInt(row['L3']) || 0) +
      (parseInt(row['L4']) || 0);
  }, 0);

  const totalAlgae = data.reduce((sum, row) => {
    return sum +
      (parseInt(row['Auton Algae in Net'] || 0)) * 2 +
      (parseInt(row['Auton Algae in Processor'] || 0)) * 3 +
      (parseInt(row['Algae in Net'] || 0) * 2) +
      (parseInt(row['Algae in Processor'] || 0) * 3);
  }, 0);

  const averageEPA = data.length > 0 ? (totalScore / data.length).toFixed(1) : "";
  const averageCoral = data.length > 0 ? (totalCoral / data.length).toFixed(1) : "";
  const averageAlgae = data.length > 0 ? (totalAlgae / data.length).toFixed(1) : "";

  document.getElementById('averageEPA').textContent = averageEPA;
  document.getElementById('averageCoral').textContent = averageCoral;
  document.getElementById('averageAlgae').textContent = averageAlgae;

  const coralCycles = data.map(row => {
    return (parseInt(row['L1']) || 0) +
      (parseInt(row['L2']) || 0) +
      (parseInt(row['L3']) || 0) +
      (parseInt(row['L4']) || 0);
  });
  const maxCoral = Math.max(...coralCycles, 0);
  const maxCoralMatch = maxCoral > 0 ? `Q${data[coralCycles.indexOf(maxCoral)].Match}` : "";

  const algaeCycles = data.map(row => {
    return (parseInt(row['Algae in Net'] || 0)) +
      (parseInt(row['Algae in Processor'] || 0));
  });
  const maxAlgae = Math.max(...algaeCycles, 0);
  const maxAlgaeMatch = maxAlgae > 0 ? `Q${data[algaeCycles.indexOf(maxAlgae)].Match}` : "";

  document.getElementById('maxCoral').textContent = maxCoral > 0 ? maxCoral : "";
  document.getElementById('maxCoralMatch').textContent = maxCoralMatch;
  document.getElementById('maxAlgae').textContent = maxAlgae > 0 ? maxAlgae : "";
  document.getElementById('maxAlgaeMatch').textContent = maxAlgaeMatch;

  const defenseData = defenseRankings.find(t => t.team === teamNumber);
  const defenseRank = defenseData ? `${defenseData.rank}/${defenseRankings.length}` : 'N/A';
  document.getElementById('defenseRank').textContent = defenseRank;

}
function renderFlaggedMatches(data) {
  const flaggedMatchesDiv = document.getElementById('flaggedMatches');
  flaggedMatchesDiv.innerHTML = '';

  if (!data || data.length === 0) {
    flaggedMatchesDiv.innerHTML = '<p>No data available for this team.</p>';
    return;
  }

  const validMatches = data.filter(row => row['Died or Immobilized'] !== '1');
  const scores = validMatches.map(row => parseFloat(row['Total Score'] || 0));

  const sortedScores = [...scores].sort((a, b) => a - b);
  const q1 = calculatePercentile(sortedScores, 25);
  const q3 = calculatePercentile(sortedScores, 75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const lowestScoreMatch = data.reduce((lowest, row) => {
    const score = parseFloat(row['Total Score'] || 0);
    return score < lowest.score ? { match: row.Match, score } : lowest;
  }, { match: null, score: Infinity });

  const flaggedMatches = data
    .filter(row => {
      const score = parseFloat(row['Total Score'] || 0);
      const isOutlier = score < lowerBound || score > upperBound;

      return (
        row['Died or Immobilized'] === '1' ||
        row['Defense was played on robot'] === '1' ||
        parseFloat(row['Defense Rating'] || 0) > 1 ||
        row.Match === lowestScoreMatch.match ||
        (isOutlier && row['Died or Immobilized'] !== '1')
      );
    })
    .map(row => {
      const reasons = [];
      if (row['Died or Immobilized'] === '1') reasons.push(' Robot Died');
      if (row['Defense was played on robot'] === '1') reasons.push(' Defended On');
      if (parseFloat(row['Defense Rating'] || 0) > 1) reasons.push(' Played Defense');
      if (row.Match === lowestScoreMatch.match) reasons.push(' Lowest Score');

      const score = parseFloat(row['Total Score'] || 0);
      if (score < lowerBound || score > upperBound) {
        reasons.push(' Outlier Score');
      }

      return `<p><strong>Q${row.Match}:</strong> ${reasons} </p>`;
    });

  if (flaggedMatches.length > 0) {
    flaggedMatchesDiv.innerHTML = flaggedMatches.join('<hr style="border: 0; margin: 10px 0;">');
  } else {
    flaggedMatchesDiv.innerHTML = '<p>No flagged matches.</p>';
  }
}

function calculatePercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) return 0;
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sortedArray[lower];

  return sortedArray[lower] + (sortedArray[upper] - sortedArray[lower]) * (index - lower);
}
function renderEndGameChart(data) {
  destroyChart('endGame');

  const sortedData = data.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));
  const matchLabels = sortedData.map(row => 'Q' + row.Match);
  const climbScores = sortedData.map(row => parseFloat(row['Climb Score'] || 0));

  const colors = climbScores.map(score => {
    if (score === 12 || score === 6 || score === 2) return '#3EDBF0';
    if (score === 2.1) return '#FF5C5C';
    return '#888888';
  });

  charts.endGame = createChart(
    document.getElementById('endGame').getContext('2d'),
    'bar',
    {
      labels: matchLabels,
      datasets: [
        {
          label: 'Climb Score',
          data: climbScores,
          backgroundColor: colors
        }
      ]
    },
    getChartOptions(false, 6)
  );
}


function renderEpaTrendChart(data, canvasId) {
  destroyChart(canvasId);

  if (!data || data.length === 0) {
    renderBlankChart(canvasId, "No EPA Data");
    return;
  }

  const sortedData = data.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));
  const matchLabels = sortedData.map(row => 'Q' + row.Match);
  const epaValues = sortedData.map(row => parseFloat(row['Total Score'] || 0));

  const avgEPA = epaValues.reduce((sum, val) => sum + val, 0) / epaValues.length;
  const averageLine = Array(matchLabels.length).fill(avgEPA);

  charts[canvasId] = createChart(
    document.getElementById(canvasId).getContext('2d'),
    'line',
    {
      labels: matchLabels,
      datasets: [
        {
          label: 'EPA',
          data: epaValues,
          borderColor: '#3EDBF0',
          backgroundColor: 'rgba(93, 219, 254, 0.1)',
          borderWidth: 3,
          pointBackgroundColor: '#3EDBF0',
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHitRadius: 10,
          pointHoverBorderWidth: 3,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Avg. EPA',
          data: averageLine,
          borderColor: '#0343FC',
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 10,
          pointHoverRadius: 6,
          tension: 0,
          hidden: !document.getElementById('EPAAvg')?.checked
        }
      ]
    },
    {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: 2,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            beforeBody: function (tooltipItems) {
              const context = tooltipItems[0];
              const label = context.dataset.label;
              const showAvg = document.getElementById('hideEPAAvg')?.checked;

              if (label === 'Avg. EPA' || !showAvg) return null;

              const value = context.parsed.y;
              const delta = value - avgEPA;
              const sign = delta >= 0 ? '+' : '';
              return `Δ: ${sign}${delta.toFixed(2)}`;
            },
            label: function (context) {
              const label = context.dataset.label;
              const value = context.parsed.y;
              const showAvg = document.getElementById('hideEPAAvg')?.checked;

              if (label === 'Avg. EPA') {
                return showAvg ? `Avg. EPA: ${value.toFixed(2)}` : null;
              }

              return `EPA: ${value.toFixed(2)}`;
            }
          },
          backgroundColor: '#1C1E21',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#000',
          borderWidth: 1,
          titleFont: { family: 'Lato', size: 14 },
          bodyFont: { family: 'Lato', size: 14 },
          padding: 10,
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 12, weight: 'bold' }
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 12, weight: 'bold' },
            stepSize: 20,
          }
        }
      }
    }
  );
}
function renderBlankChart(canvasId, label = "No Data") {
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [label],
      datasets: [
        {
          label: label,
          data: [0],
          backgroundColor: '#888888'
        }
      ]
    },
    options: getChartOptions(false)
  });
}

function filterAndRenderCharts(filterValue) {
  const teamNumber = document.getElementById('teamSearch').value.trim();
  if (!teamNumber) {
    renderBlankCharts();
    return;
  }

  const algaeFilter = document.getElementById('algaeTypeFilter').value;

  const filteredData = filterTeamData(teamNumber);
  let autoFilteredData = [...filteredData];

  if (filterValue === 'side') {
    autoFilteredData = autoFilteredData.filter(row => ['o', 'p'].includes(row['Auton Starting Position']));
  } else if (filterValue === 'center') {
    autoFilteredData = autoFilteredData.filter(row => row['Auton Starting Position'] === 'c');
  } else if (filterValue === 'processor') {
    autoFilteredData = autoFilteredData.filter(row => row['Auton Starting Position'] === 'p');
  } else if (filterValue === 'barge') {
    autoFilteredData = autoFilteredData.filter(row => row['Auton Starting Position'] === 'o');
  }

  if (autoFilteredData.length === 0) {
    renderBlankChart('autoCoral', "No Data");
    renderBlankChart('autoAlgae', "No Data");
  } else {
    renderAutoCharts(autoFilteredData);
  }

  renderTeleCharts(filteredData);
  renderEndGameChart(filteredData);
  renderTeleAlgaeChartFiltered(filteredData, algaeFilter);
}
function syncDropdowns(value) {
  document.querySelectorAll('#startingPositionFilter').forEach(dropdown => {
    dropdown.value = value;
  });
}

/*-----COMPARISON VIEW----*/

function getMaxTeleCoral(team1Data, team2Data) {
  const combined = [...team1Data, ...team2Data];

  let maxTotal = 0;

  combined.forEach(row => {
    const totalCoral =
      (parseInt(row['L1']) || 0) +
      (parseInt(row['L2']) || 0) +
      (parseInt(row['L3']) || 0) +
      (parseInt(row['L4']) || 0);

    if (totalCoral > maxTotal) {
      maxTotal = totalCoral;
    }
  });

  return maxTotal;
}
function getMaxEPA(team1Data, team2Data) {
  const combined = [...team1Data, ...team2Data];
  let max = 0;
  combined.forEach(row => {
    const score = parseFloat(row['Total Score'] || 0);
    if (score > max) max = score;
  });
  return Math.ceil(max / 20) * 20;
}

function getMaxTeleAlgae(team1Data, team2Data, filter = 'all') {
  const combined = [...team1Data, ...team2Data];
  let max = 0;

  combined.forEach(row => {
    let value = 0;
    if (filter === 'remove') {
      value = parseInt(row['Algae removed'] || 0);
    } else if (filter === 'barge') {
      value = parseInt(row['Algae in Net'] || 0);
    } else if (filter === 'process') {
      value = parseInt(row['Algae in Processor'] || 0);
    } else {
      value =
        (parseInt(row['Algae removed'] || 0)) +
        (parseInt(row['Algae in Net'] || 0)) +
        (parseInt(row['Algae in Processor'] || 0));
    }

    if (value > max) {
      max = value;
    }
  });

  return Math.ceil(max / 2) * 2;
}

function getMaxAutoCoral(team1Data, team2Data, filterValue = 'all') {
  const combined = [...team1Data, ...team2Data];

  let filtered = combined;
  if (filterValue === 'side') {
    filtered = filtered.filter(row => ['o', 'p'].includes(row['Auton Starting Position']));
  } else if (filterValue === 'center') {
    filtered = filtered.filter(row => row['Auton Starting Position'] === 'c');
  } else if (filterValue === 'processor') {
    filtered = filtered.filter(row => row['Auton Starting Position'] === 'p');
  } else if (filterValue === 'barge') {
    filtered = filtered.filter(row => row['Auton Starting Position'] === 'o');
  }

  let max = 0;
  filtered.forEach(row => {
    const total =
      (parseInt(row['Auton L1']) || 0) +
      (parseInt(row['Auton L2']) || 0) +
      (parseInt(row['Auton L3']) || 0) +
      (parseInt(row['Auton L4']) || 0);
    if (total > max) max = total;
  });

  return Math.ceil(max / 1) * 1;
}

function getMaxAutoAlgae(team1Data, team2Data, filterValue = 'all') {
  const combined = [...team1Data, ...team2Data];

  let filtered = combined;
  if (filterValue === 'side') {
    filtered = filtered.filter(row => ['o', 'p'].includes(row['Auton Starting Position']));
  } else if (filterValue === 'center') {
    filtered = filtered.filter(row => row['Auton Starting Position'] === 'c');
  } else if (filterValue === 'processor') {
    filtered = filtered.filter(row => row['Auton Starting Position'] === 'p');
  } else if (filterValue === 'barge') {
    filtered = filtered.filter(row => row['Auton Starting Position'] === 'o');
  }

  let max = 0;
  filtered.forEach(row => {
    const total =
      (parseInt(row['Auton Algae in Net']) || 0) +
      (parseInt(row['Auton Algae in Processor']) || 0);
    if (total > max) max = total;
  });

  return Math.ceil(max / 1) * 1;
}


function searchComparisonBothTeams() {
  const team1 = document.getElementById('comparisonSearch1').value.trim();
  const team2 = document.getElementById('comparisonSearch2').value.trim();

  displayTeamNickname(team1, 'teamNameDisplay1');
  displayTeamNickname(team2, 'teamNameDisplay2');

  const team1Data = filterTeamData(team1);
  const team2Data = filterTeamData(team2);

  const maxTeleopCoral = getMaxTeleCoral(team1Data, team2Data);
  const algaeFilter = document.getElementById('algaeTypeFilter1').value || 'all';
  const maxTeleopAlgae = getMaxTeleAlgae(team1Data, team2Data, algaeFilter);
  const yMax = Math.ceil(maxTeleopCoral / 2) * 2;
  const maxEPA = getMaxEPA(team1Data, team2Data);
  const startFilter = document.getElementById('startingPositionFilter1').value || 'all';
  const maxAutoCoral = getMaxAutoCoral(team1Data, team2Data, startFilter);
  const maxAutoAlgae = getMaxAutoAlgae(team1Data, team2Data, startFilter);

  searchComparison(1, yMax, maxTeleopAlgae, maxEPA, maxAutoCoral, maxAutoAlgae);
  searchComparison(2, yMax, maxTeleopAlgae, maxEPA, maxAutoCoral, maxAutoAlgae);
}
function searchComparison(teamNumber, yMaxOverride = null, yMaxAlgaeOverride = null, maxEPAOverride = null, maxAutoCoralOverride = null, maxAutoAlgaeOverride = null) {

  const teamInputId = teamNumber === 1 ? 'comparisonSearch1' : 'comparisonSearch2';
  const otherTeamInputId = teamNumber === 1 ? 'comparisonSearch2' : 'comparisonSearch1';
  const coralCanvasId = teamNumber === 1 ? 'autoCoralTeam1' : 'autoCoralTeam2';
  const algaeCanvasId = teamNumber === 1 ? 'autoAlgaeTeam1' : 'autoAlgaeTeam2';
  const teleCoralCanvasId = teamNumber === 1 ? 'teleCoralTeam1' : 'teleCoralTeam2';
  const teleAlgaeCanvasId = teamNumber === 1 ? 'teleAlgaeTeam1' : 'teleAlgaeTeam2';
  const endGameCanvasId = teamNumber === 1 ? 'endGameTeam1' : 'endGameTeam2';
  const scouterCommentsId = teamNumber === 1 ? 'scouterComments1' : 'scouterComments2';
  const epaTrendCanvasId = teamNumber === 1 ? 'epaTrendTeam1' : 'epaTrendTeam2';
  const teamNameDisplayId = teamNumber === 1 ? 'teamNameDisplay1' : 'teamNameDisplay2';

  const teamNumberInput = document.getElementById(teamInputId).value.trim();
  const otherTeamNumberInput = document.getElementById(otherTeamInputId).value.trim();

  displayTeamNickname(teamNumberInput, teamNameDisplayId);

  document.getElementById(`startingPositionFilter${teamNumber}`).value = 'all';
  document.querySelectorAll('.hideEPAAvgComparison').forEach(cb => cb.checked = true);


  let teamData = filterTeamData(teamNumberInput);
  let otherTeamData = filterTeamData(otherTeamNumberInput);

  const yMax = yMaxOverride !== null
    ? yMaxOverride
    : Math.ceil(getMaxTeleCoral(teamData, otherTeamData) / 2) * 2;

  const yMaxAlgae = yMaxAlgaeOverride !== null
    ? yMaxAlgaeOverride
    : Math.ceil(getTopAlgaeMatchFromTwoTeams(teamData, otherTeamData) / 2) * 2;

  const maxEPA = maxEPAOverride !== null
    ? maxEPAOverride
    : Math.ceil(getMaxEPA(teamData, otherTeamData) / 20) * 20;

  const maxAutoCoral = maxAutoCoralOverride !== null
    ? maxAutoCoralOverride
    : Math.ceil(getMaxAutoCoral(teamData, otherTeamData) / 1) * 1;

  const maxAutoAlgae = maxAutoAlgaeOverride !== null
    ? maxAutoAlgaeOverride
    : Math.ceil(getMaxAutoAlgae(teamData, otherTeamData) / 1) * 1;

  if (teamData.length === 0) {
    renderBlankChart(coralCanvasId);
    renderBlankChart(algaeCanvasId);
    renderBlankChart(teleCoralCanvasId);
    renderBlankChart(teleAlgaeCanvasId);
    renderBlankChart(endGameCanvasId);
    document.getElementById(scouterCommentsId).innerHTML = 'No qualitative notes available for this team.';
    return;
  }

  teamData = teamData.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));
  otherTeamData = otherTeamData.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));


  renderAutoCoralChartForTeam(teamData, coralCanvasId, maxAutoCoral);
  renderAutoAlgaeChartForTeam(teamData, algaeCanvasId, maxAutoAlgae);
  renderTeleCoralChartForTeam(teamData, teleCoralCanvasId, yMax);
  renderTeleAlgaeChartForTeam(teamData, teleAlgaeCanvasId, yMaxAlgae);
  renderEndGameChartForTeam(teamData, endGameCanvasId);
  renderScouterCommentsForTeam(teamData, scouterCommentsId);
  renderComparisonTeamStatistics(teamData, pitScoutingData, teamNumber);
  renderEPATrendChartForTeam(teamData, epaTrendCanvasId, maxEPA);

  const currentFilterValue = document.getElementById(`startingPositionFilter${teamNumber}`).value;
  syncDropdownsAndFilter(currentFilterValue);

  filterAndRenderAlgaeCharts(1, 'all');
  filterAndRenderAlgaeCharts(2, 'all');
}
function renderTeleCoralChartForTeam(teamData, canvasId, maxYValue = null) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const matchLabels = teamData.map(row => 'Q' + row.Match);
  const coralL1 = teamData.map(row => parseInt(row['L1'] || 0));
  const coralL2 = teamData.map(row => parseInt(row['L2'] || 0));
  const coralL3 = teamData.map(row => parseInt(row['L3'] || 0));
  const coralL4 = teamData.map(row => parseInt(row['L4'] || 0));

  const yMax = maxYValue !== null ? maxYValue : getMaxTeleCoral(teamData, []);

  const stepSize = maxYValue > 16 ? 4 : 2;
  const newMax = Math.ceil(yMax / stepSize) * stepSize;


  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: matchLabels,
      datasets: [
        { label: 'L1', data: coralL1, backgroundColor: '#3B064D' },
        { label: 'L2', data: coralL2, backgroundColor: '#8105D8' },
        { label: 'L3', data: coralL3, backgroundColor: '#ED0CEF' },
        { label: 'L4', data: coralL4, backgroundColor: '#FF8BFC' }
      ]
    },
    options: {
      ...getChartOptions(true, 2),
      scales: {
        ...getChartOptions(true, 2).scales,
        y: {
          ...getChartOptions(true, 2).scales.y,
          max: newMax,
          ticks: {
            ...getChartOptions(true, 2).scales.y.ticks,
            stepSize: stepSize
          }
        }
      },
      plugins: {
        ...getChartOptions(true, 2).plugins,
        tooltip: {
          ...getChartOptions(true, 2).plugins.tooltip,
          callbacks: {
            afterBody: function (context) {
              const dataIndex = context[0].dataIndex;
              const row = teamData[dataIndex];
              const total =
                (parseInt(row['L1'] || 0)) +
                (parseInt(row['L2'] || 0)) +
                (parseInt(row['L3'] || 0)) +
                (parseInt(row['L4'] || 0));
              return `Total Coral: ${total}`;
            }
          }
        }
      }
    }
  });

  return newMax;
}

function renderAutoCoralChartForTeam(teamData, canvasId, maxY = null) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const matchLabels = teamData.map(row => 'Q' + row.Match);
  const coralL1 = teamData.map(row => parseInt(row['Auton L1'] || 0));
  const coralL2 = teamData.map(row => parseInt(row['Auton L2'] || 0));
  const coralL3 = teamData.map(row => parseInt(row['Auton L3'] || 0));
  const coralL4 = teamData.map(row => parseInt(row['Auton L4'] || 0));

  const yMax = maxY ?? Math.ceil(Math.max(...coralL1, ...coralL2, ...coralL3, ...coralL4) / 1) * 1;

  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: matchLabels,
      datasets: [
        { label: 'L1', data: coralL1, backgroundColor: '#3B064D' },
        { label: 'L2', data: coralL2, backgroundColor: '#8105D8' },
        { label: 'L3', data: coralL3, backgroundColor: '#ED0CEF' },
        { label: 'L4', data: coralL4, backgroundColor: '#FF8BFC' }
      ]
    },
    options: {
      ...getChartOptions(true, 2),
      scales: {
        ...getChartOptions(true, 2).scales,
        y: {
          ...getChartOptions(true, 2).scales.y,
          max: yMax,
          ticks: {
            ...getChartOptions(true, 2).scales.y.ticks,
            stepSize: 1
          }
        }
      }
    }
  });

  return yMax;
}



function renderAutoAlgaeChartForTeam(teamData, canvasId, maxY = null) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const matchLabels = teamData.map(row => 'Q' + row.Match);
  const algaeRemoved = teamData.map(row => parseInt(row['Auton Algae removed'] || 0));
  const algaeNet = teamData.map(row => parseInt(row['Auton Algae in Net'] || 0));
  const algaeProcessor = teamData.map(row => parseInt(row['Auton Algae in Processor'] || 0));

  const yMax = maxY ?? Math.ceil(Math.max(...algaeNet, ...algaeProcessor) / 1) * 1;

  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: matchLabels,
      datasets: [
        { label: 'Removed', data: algaeRemoved, backgroundColor: '#002BFF' },
        { label: 'Net', data: algaeNet, backgroundColor: '#00D2F3' },
        { label: 'Processor', data: algaeProcessor, backgroundColor: '#5cffd5' }
      ]
    },
    options: {
      ...getChartOptions(true, 2),
      scales: {
        ...getChartOptions(true, 2).scales,
        y: {
          ...getChartOptions(true, 2).scales.y,
          max: yMax,
          ticks: {
            ...getChartOptions(true, 2).scales.y.ticks,
            stepSize: 1
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1C1E21',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#000',
          borderWidth: 1,
          titleFont: { family: 'Lato', size: 14 },
          bodyFont: { family: 'Lato', size: 14 },
          padding: 10
        }
      }
    }
  });
}

function renderEPATrendChartForTeam(teamData, canvasId, maxY = null) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const sortedData = teamData.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));
  const matchLabels = sortedData.map(row => 'Q' + row.Match);
  const epaValues = sortedData.map(row => parseFloat(row['Total Score'] || 0));

  const avgEPA = epaValues.reduce((sum, val) => sum + val, 0) / epaValues.length;
  const averageLine = Array(matchLabels.length).fill(avgEPA);

  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: matchLabels,
      datasets: [
        {
          label: 'EPA',
          data: epaValues,
          borderColor: '#3EDBF0',
          backgroundColor: 'rgba(93, 219, 254, 0.1)',
          borderWidth: 3,
          pointBackgroundColor: '#3EDBF0',
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHitRadius: 10,
          pointHoverBorderWidth: 3,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Avg. EPA',
          data: averageLine,
          borderColor: '#0343FC',
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 10,
          pointHoverRadius: 6,
          tension: 0,
          hidden: !document.getElementById('hideEPAAvg')?.checked
        }

      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      devicePixelRatio: 2,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            beforeBody: function (tooltipItems) {
              const context = tooltipItems[0];
              const label = context.dataset.label;
              const showAvg = document.querySelector('.hideEPAAvgComparison').checked;

              if (label === 'Avg. EPA' || !showAvg) return null;

              const value = context.parsed.y;
              const avgEPA = context.dataset.data[0];
              const delta = value - avgEPA;
              const sign = delta >= 0 ? '+' : '';
              return `Δ: ${sign}${delta.toFixed(2)}`;
            }
          },
          backgroundColor: '#1C1E21',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#000',
          borderWidth: 1,
          titleFont: { family: 'Lato', size: 14 },
          bodyFont: { family: 'Lato', size: 14 },
          padding: 10,
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 12, weight: 'bold' }
          }
        },
        y: {
          beginAtZero: true,
          max: maxY ?? undefined,
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 12, weight: 'bold' },
            stepSize: 20
          }
        }
      }
    }
  });
}

function syncAlgaeDropdownsAndFilter(value) {
  document.querySelectorAll('#algaeTypeFilter1, #algaeTypeFilter2').forEach(dropdown => {
    dropdown.value = value;
  });

  filterAndRenderAlgaeCharts(1, value);
  filterAndRenderAlgaeCharts(2, value);
}

function filterAndRenderAlgaeCharts(teamNumber, filterValue) {
  const teamInputId = teamNumber === 1 ? 'comparisonSearch1' : 'comparisonSearch2';
  const teleAlgaeCanvasId = teamNumber === 1 ? 'teleAlgaeTeam1' : 'teleAlgaeTeam2';

  const teamNumberInput = document.getElementById(teamInputId).value.trim();
  if (!teamNumberInput) {
    renderBlankChart(teleAlgaeCanvasId);
    return;
  }

  let teamData = filterTeamData(teamNumberInput);
  if (teamData.length === 0) {
    renderBlankChart(teleAlgaeCanvasId);
    return;
  }

  teamData = teamData.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));

  let filteredData = [...teamData];
  if (filterValue === 'remove') {
    filteredData = filteredData.filter(row => parseInt(row['Algae removed'] || 0) > 0);
  } else if (filterValue === 'barge') {
    filteredData = filteredData.filter(row => parseInt(row['Algae in Net'] || 0) > 0);
  } else if (filterValue === 'process') {
    filteredData = filteredData.filter(row => parseInt(row['Algae in Processor'] || 0) > 0);
  }

  const otherTeamInputId = teamNumber === 1 ? 'comparisonSearch2' : 'comparisonSearch1';
  const otherTeamInput = document.getElementById(otherTeamInputId).value.trim();
  const otherTeamData = filterTeamData(otherTeamInput);

  const maxY = getMaxTeleAlgae(teamData, otherTeamData, filterValue);

  renderFilteredTeleAlgaeChartForTeam(filteredData, teleAlgaeCanvasId, filterValue, maxY);
}


function renderFilteredTeleAlgaeChartForTeam(teamData, canvasId, filterValue, yMax = null) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const matchLabels = teamData.map(row => 'Q' + row.Match);
  const datasets = [];

  if (filterValue === 'all' || filterValue === 'remove') {
    datasets.push({
      label: 'Removed',
      data: teamData.map(row => parseInt(row['Algae removed'] || 0)),
      backgroundColor: '#002BFF'
    });
  }

  if (filterValue === 'all' || filterValue === 'barge') {
    datasets.push({
      label: 'Net',
      data: teamData.map(row => parseInt(row['Algae in Net'] || 0)),
      backgroundColor: '#00D2F3'
    });
  }

  if (filterValue === 'all' || filterValue === 'process') {
    datasets.push({
      label: 'Processor',
      data: teamData.map(row => parseInt(row['Algae in Processor'] || 0)),
      backgroundColor: '#5cffd5'
    });
  }

  if (datasets.length === 0) {
    renderBlankChart(canvasId, "No Data");
    return;
  }

  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: matchLabels,
      datasets: datasets
    },
    options: {
      ...getChartOptions(true, 2),
      scales: {
        ...getChartOptions(true, 2).scales,
        y: {
          ...getChartOptions(true, 2).scales.y,
          max: yMax ?? undefined,
          ticks: {
            ...getChartOptions(true, 2).scales.y.ticks,
            stepSize: 2
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1C1E21',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#000',
          borderWidth: 1,
          titleFont: { family: 'Lato', size: 14 },
          bodyFont: { family: 'Lato', size: 14 },
          padding: 10
        }
      }
    }
  });
}


function renderTeleAlgaeChartForTeam(teamData, canvasId, yMax) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const matchLabels = teamData.map(row => 'Q' + row.Match);
  const algaeRemoved = teamData.map(row => parseInt(row['Algae removed'] || 0));
  const algaeNet = teamData.map(row => parseInt(row['Algae in Net'] || 0));
  const algaeProcessed = teamData.map(row => parseInt(row['Algae in Processor'] || 0));

  const maxYValue = yMax ?? Math.ceil(Math.max(...algaeRemoved, ...algaeNet, ...algaeProcessed) / 1) * 1;

  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: matchLabels,
      datasets: [
        { label: 'Removed', data: algaeRemoved, backgroundColor: '#002BFF' },
        { label: 'Net', data: algaeNet, backgroundColor: '#00D2F3' },
        { label: 'Processor', data: algaeProcessed, backgroundColor: '#5cffd5' }
      ]
    },
    options: {
      ...getChartOptions(true, 2),
      scales: {
        ...getChartOptions(true, 2).scales,
        y: {
          ...getChartOptions(true, 2).scales.y,
          max: maxYValue,
          ticks: {
            ...getChartOptions(true, 2).scales.y.ticks,
            stepSize: 2
          }
        }
      },
      plugins: {
        ...getChartOptions(true, 2).plugins,
        tooltip: {
          ...getChartOptions(true, 2).plugins.tooltip,
          callbacks: {}
        }
      }
    }
  });

  return maxYValue;
}

function renderEndGameChartForTeam(teamData, canvasId) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const matchLabels = teamData.map(row => 'Q' + row.Match);
  const climbScores = teamData.map(row => parseFloat(row['Climb Score'] || 0));

  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: matchLabels,
      datasets: [
        {
          label: 'Climb Score',
          data: climbScores,
          backgroundColor: climbScores.map(score =>
            score === 12 || score === 6 || score === 2 ? '#3EDBF0' : '#FF5C5C'
          )
        }
      ]
    },
    options: getChartOptions(false, 6)
  });
}

function renderComparisonTeamStatistics(teamData, pitData, teamNumber) {
  const climbSuccessRateId = `comparisonClimbSuccessRate${teamNumber}`;
  const robotDiedRateId = `comparisonRobotDiedRate${teamNumber}`;
  const groundBargeId = `comparisonGroundBarge${teamNumber}`;
  const groundProcessorId = `comparisonGroundProcessor${teamNumber}`;
  const averageEPAId = `comparisonAverageEPA${teamNumber}`;
  const averageCoralId = `comparisonAverageCoral${teamNumber}`;
  const averageAlgaeId = `comparisonAverageAlgae${teamNumber}`;

  const clearValue = (id, defaultValue = '') => {
    document.getElementById(id).textContent = defaultValue;
  };

  clearValue(climbSuccessRateId, '0.00');
  clearValue(robotDiedRateId, '0.00');
  clearValue(groundBargeId);
  clearValue(groundProcessorId);
  clearValue(averageEPAId, '0.00');
  clearValue(averageCoralId, '0.00');
  clearValue(averageAlgaeId, '0.00');

  if (!teamData || teamData.length === 0) return;

  let groundBarge = '';
  let groundProcessor = '';

  if (pitData && pitData.length > 0) {
    const teamPitData = pitData.find(team => {
      const pitTeamNumber = team['Team No.']?.toString().trim();
      return pitTeamNumber === teamData[0]['Team No.'].toString().trim();
    });

    if (teamPitData) {
      if (teamPitData['Ground Barge'] !== undefined) {
        groundBarge = teamPitData['Ground Barge'] ? '✅' : '❌';
      }

      if (teamPitData['Ground Processor'] !== undefined) {
        groundProcessor = teamPitData['Ground Processor'] ? '✅' : '❌';
      }
    }
  }
  document.getElementById(groundBargeId).textContent = groundBarge;
  document.getElementById(groundProcessorId).textContent = groundProcessor;

  const climbScores = teamData.map(row => parseFloat(row['Climb Score'] || 0));
  const successfulClimbs = climbScores.filter(score => score === 12 || score === 6).length;
  const totalClimbAttempts = climbScores.filter(score => score === 12 || score === 6 || score === 2.1).length;
  const climbSuccessRate = totalClimbAttempts > 0 ? (successfulClimbs / totalClimbAttempts * 100).toFixed(1) : "0.00";
  const robotDiedRate = teamData.length > 0 ? (teamData.filter(row => row['Died or Immobilized'] === '1').length / teamData.length * 100).toFixed(1) : "0.00";

  document.getElementById(climbSuccessRateId).textContent = climbSuccessRate;
  document.getElementById(robotDiedRateId).textContent = robotDiedRate;

  const totalScore = teamData.reduce((sum, row) => sum + (parseFloat(row['Total Score']) || 0), 0);
  const totalCoral = teamData.reduce((sum, row) => {
    return sum +
      (parseInt(row['Auton L1']) || 0) +
      (parseInt(row['Auton L2']) || 0) +
      (parseInt(row['Auton L3']) || 0) +
      (parseInt(row['Auton L4']) || 0) +
      (parseInt(row['L1']) || 0) +
      (parseInt(row['L2']) || 0) +
      (parseInt(row['L3']) || 0) +
      (parseInt(row['L4']) || 0);
  }, 0);

  const totalAlgae = teamData.reduce((sum, row) => {
    return sum +
      (parseInt(row['Auton Algae in Net'] || 0)) * 2 +
      (parseInt(row['Auton Algae in Processor'] || 0)) * 3 +
      (parseInt(row['Algae in Net'] || 0) * 2) +
      (parseInt(row['Algae in Processor'] || 0) * 3);
  }, 0);

  const averageEPA = teamData.length > 0 ? (totalScore / teamData.length).toFixed(1) : "0.00";
  const averageCoral = teamData.length > 0 ? (totalCoral / teamData.length).toFixed(1) : "0.00";
  const averageAlgae = teamData.length > 0 ? (totalAlgae / teamData.length).toFixed(1) : "0.00";

  document.getElementById(averageEPAId).textContent = averageEPA;
  document.getElementById(averageCoralId).textContent = averageCoral;
  document.getElementById(averageAlgaeId).textContent = averageAlgae;
}

function renderScouterCommentsForTeam(teamData, containerId) {
  const scouterCommentsDiv = document.getElementById(containerId);

  scouterCommentsDiv.innerHTML = '';

  const notes = teamData
    .filter(row => row['Comments'] && row['Comments'].trim() !== '')
    .map(row => `Q${row.Match}: ${row['Comments']}`);

  if (notes.length > 0) {
    scouterCommentsDiv.innerHTML = notes.join('<hr style="border: 0; margin: 10px 0;">');
  } else {
    scouterCommentsDiv.innerHTML = 'No qualitative notes available for this team.';
  }
}
function syncDropdownsAndFilter(value) {
  const algae1 = document.getElementById('algaeTypeFilter1').value;
  const algae2 = document.getElementById('algaeTypeFilter2').value;

  document.querySelectorAll('.comparison-filter').forEach(dropdown => {
    dropdown.value = value;
  });

  const team1Input = document.getElementById('comparisonSearch1').value.trim();
  const team2Input = document.getElementById('comparisonSearch2').value.trim();

  const team1Data = filterTeamData(team1Input);
  const team2Data = filterTeamData(team2Input);

  const maxAutoCoral = getMaxAutoCoral(team1Data, team2Data, value);
  const maxAutoAlgae = getMaxAutoAlgae(team1Data, team2Data, value);

  filterAndRenderComparisonCharts(1, value, maxAutoCoral, maxAutoAlgae);
  filterAndRenderComparisonCharts(2, value, maxAutoCoral, maxAutoAlgae);

  document.getElementById('algaeTypeFilter1').value = algae1;
  document.getElementById('algaeTypeFilter2').value = algae2;
  filterAndRenderAlgaeCharts(1, algae1);
  filterAndRenderAlgaeCharts(2, algae2);
}

function filterAndRenderComparisonCharts(teamNumber, filterValue, yMaxCoral = null, yMaxAlgae = null) {
  const teamInputId = teamNumber === 1 ? 'comparisonSearch1' : 'comparisonSearch2';
  const coralCanvasId = teamNumber === 1 ? 'autoCoralTeam1' : 'autoCoralTeam2';
  const algaeCanvasId = teamNumber === 1 ? 'autoAlgaeTeam1' : 'autoAlgaeTeam2';

  const teamNumberInput = document.getElementById(teamInputId).value.trim();

  if (!teamNumberInput) {
    renderBlankChart(coralCanvasId);
    renderBlankChart(algaeCanvasId);
    return;
  }

  let teamData = filterTeamData(teamNumberInput);
  if (teamData.length === 0) {
    renderBlankChart(coralCanvasId);
    renderBlankChart(algaeCanvasId);
    return;
  }

  teamData = teamData.sort((a, b) => parseInt(a.Match) - parseInt(b.Match));

  let filteredData = [...teamData];
  if (filterValue === 'side') {
    filteredData = filteredData.filter(row => ['o', 'p'].includes(row['Auton Starting Position']));
  } else if (filterValue === 'center') {
    filteredData = filteredData.filter(row => row['Auton Starting Position'] === 'c');
  } else if (filterValue === 'processor') {
    filteredData = filteredData.filter(row => row['Auton Starting Position'] === 'p');
  } else if (filterValue === 'barge') {
    filteredData = filteredData.filter(row => row['Auton Starting Position'] === 'o');
  }

  const dataToUse = filterValue === 'all' ? teamData : filteredData;

  if (dataToUse.length > 0) {
    renderAutoCoralChartForTeam(dataToUse, coralCanvasId, yMaxCoral);
    renderAutoAlgaeChartForTeam(dataToUse, algaeCanvasId, yMaxAlgae);
  } else {
    renderBlankChart(coralCanvasId);
    renderBlankChart(algaeCanvasId);
  }
}
/*-----OVERVIEW STACKED CHART----*/

function getChartClickHandler() {
  return function (event) {
    const points = this.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (!points.length) return;

    const index = points[0].index;
    const teamLabel = this.data.labels[index];

    if (teamLabel) {
      const teamNumber = teamLabel.replace('Team ', '');
      document.querySelector('.content').scrollTo({ top: 0, behavior: 'auto' });
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(button => button.classList.remove('active'));
      document.getElementById('individual').classList.add('active');
      document.querySelector('.tab[onclick*="individual"]').classList.add('active');
      document.getElementById('teamSearch').value = teamNumber;

      searchTeam();
    }
  };
}



function updateOverviewCharts() {
  const parsedData = parseCSV();
  const filter = document.getElementById('chartFilterDropdown').value;
  (parsedData.data, filter);
  renderCoralCyclesChart(parsedData.data);
  renderAlgaeCyclesChart(parsedData.data);
  renderOverviewStackedChart(parsedData.data, filter);
}

function renderOverviewStackedChart(data, filter = 'all') {

  const ctx = document.getElementById('overviewStackedChart').getContext('2d');

  if (charts['overviewStackedChart']) {
    charts['overviewStackedChart'].destroy();
  }

  const teamScores = {};
  data.forEach(row => {
    const team = row['Team No.'];
    if (!team) return;

    const autonScore = parseFloat(row['Auton Score'] || 0);
    const totalScore = parseFloat(row['Total Score'] || 0);
    const teleScore = totalScore - autonScore;

    if (!teamScores[team]) {
      teamScores[team] = { autoScore: 0, teleScore: 0, matches: 0 };
    }

    teamScores[team].autoScore += autonScore;
    teamScores[team].teleScore += teleScore;
    teamScores[team].matches += 1;
  });

  const averagedScores = Object.keys(teamScores).map(team => ({
    team,
    autoScore: teamScores[team].autoScore / teamScores[team].matches,
    teleScore: teamScores[team].teleScore / teamScores[team].matches,
    totalScore: (teamScores[team].autoScore + teamScores[team].teleScore) / teamScores[team].matches
  }));

  let sortedScores;
  if (filter === 'auto') {
    sortedScores = averagedScores.sort((a, b) => b.autoScore - a.autoScore);
  } else if (filter === 'teleop') {
    sortedScores = averagedScores.sort((a, b) => b.teleScore - a.teleScore);
  } else {
    sortedScores = averagedScores.sort((a, b) => b.totalScore - a.totalScore);
  }

  const labels = sortedScores.map(score => `Team ${score.team}`);
  const autoScores = sortedScores.map(score => score.autoScore);
  const teleScores = sortedScores.map(score => score.teleScore);

  const autoColors = sortedScores.map(score => {
    if (score.team === '226') return '#8105D8';
    if (score.team === highlightedOverviewTeam) return '#ff69b4';
    return '#002BFF';
  });

  const teleColors = sortedScores.map(score => {
    if (score.team === '226') return '#FE59D7';
    if (score.team === highlightedOverviewTeam) return '#ffaad3';
    return '#3EDBF0';
  });


  let datasets = [];
  if (filter === 'all') {
    datasets = [
      {
        label: 'Auton Score',
        data: autoScores,
        backgroundColor: autoColors
      },
      {
        label: 'Teleop Score',
        data: teleScores,
        backgroundColor: teleColors
      }
    ];
  } else if (filter === 'auto') {
    datasets = [
      {
        label: 'Auton Score',
        data: autoScores,
        backgroundColor: autoColors
      }
    ];
  } else if (filter === 'teleop') {
    datasets = [
      {
        label: 'Teleop Score',
        data: teleScores,
        backgroundColor: teleColors
      }
    ];
  }

  charts['overviewStackedChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      onClick: getChartClickHandler(),
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: 3,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            beforeBody: function (tooltipItems) {
              const index = tooltipItems[0].dataIndex;
              const ranking = index + 1;

              if (filter === 'all') {
                const totalScore = Math.round(sortedScores[index].totalScore * 100) / 100;
                return `Rank: ${ranking}\nTotal Score: ${totalScore}`;
              }

              return `Rank: ${ranking}`;
            }
          },
          backgroundColor: '#1C1E21',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#000',
          borderWidth: 1,
          titleFont: { family: 'Lato', size: 14, },
          bodyFont: { family: 'Lato', size: 14 },
          padding: 10
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 12 },
            autoSkip: false,
            maxRotation: 45,
            minRotation: 45
          },
          grid: { display: false }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 14, weight: 'bold' }
          },
          grid: { display: false }
        }
      },
      layout: {
        padding: {
          left: 10,
          right: 10,
          top: 20,
          bottom: 50
        }
      }
    }
  });
}

function renderCoralCyclesChart(data) {
  const ctx = document.getElementById('coralCyclesChart').getContext('2d');

  if (charts['coralCyclesChart']) {
    charts['coralCyclesChart'].destroy();
  }

  const teamScores = {};
  data.forEach(row => {
    const team = row['Team No.'];
    if (!team) return;

    const teleL1 = parseInt(row['L1'] || 0);
    const teleL2 = parseInt(row['L2'] || 0);
    const teleL3 = parseInt(row['L3'] || 0);
    const teleL4 = parseInt(row['L4'] || 0);

    const totalCoralCycles = teleL1 + teleL2 + teleL3 + teleL4;

    if (!teamScores[team]) {
      teamScores[team] = { coralCycles: 0, matches: 0 };
    }

    teamScores[team].coralCycles += totalCoralCycles;
    teamScores[team].matches += 1;
  });

  const averagedScores = Object.keys(teamScores).map(team => ({
    team,
    avgCoralCycles: (teamScores[team].coralCycles / teamScores[team].matches)
  }));

  const sortedScores = averagedScores.sort((a, b) => b.avgCoralCycles - a.avgCoralCycles);

  const labels = sortedScores.map(score => `Team ${score.team}`);
  const coralCycles = sortedScores.map(score => score.avgCoralCycles);

  const coralColors = sortedScores.map(score => {
    if (score.team === '226') return '#FE59D7';
    if (score.team === highlightedOverviewTeam) return '#ffaad3';
    return '#3EDBF0';
  });


  charts['coralCyclesChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Cycles',
          data: coralCycles,
          backgroundColor: coralColors
        }
      ]
    },
    options: {
      onClick: getChartClickHandler(),
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: 3,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            beforeBody: function (tooltipItems) {
              const index = tooltipItems[0].dataIndex;
              const ranking = index + 1;
              return `Rank: ${ranking}`
            },
          },
          backgroundColor: '#1C1E21',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#000',
          borderWidth: 1,
          titleFont: { family: 'Lato', size: 14 },
          bodyFont: { family: 'Lato', size: 14 },
          padding: 10
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 12 },
            autoSkip: false,
            maxRotation: 45,
            minRotation: 45
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 14, weight: 'bold' }
          },
          grid: { display: false }
        }
      },
      layout: {
        padding: {
          left: 10,
          right: 10,
          top: 20,
          bottom: 50
        }
      }
    }
  });
}
function renderAlgaeCyclesChart(data) {
  const ctx = document.getElementById('algaeCyclesChart').getContext('2d');

  if (charts['algaeCyclesChart']) {
    charts['algaeCyclesChart'].destroy();
  }

  const teamScores = {};
  data.forEach(row => {
    const team = row['Team No.'];
    if (!team) return;

    const algaeProcessor = parseInt(row['Algae in Processor'] || 0);
    const algaeNet = parseInt(row['Algae in Net'] || 0);

    const totalAlgaeCycles = algaeProcessor + algaeNet;

    if (!teamScores[team]) {
      teamScores[team] = { algaeCycles: 0, matches: 0 };
    }

    teamScores[team].algaeCycles += totalAlgaeCycles;
    teamScores[team].matches += 1;
  });

  const averagedScores = Object.keys(teamScores).map(team => ({
    team,
    avgAlgaeCycles: teamScores[team].algaeCycles / teamScores[team].matches
  }));

  const sortedScores = averagedScores.sort((a, b) => b.avgAlgaeCycles - a.avgAlgaeCycles);

  const labels = sortedScores.map(score => `Team ${score.team}`);
  const algaeCycles = sortedScores.map(score => score.avgAlgaeCycles);

  const algaeColors = sortedScores.map(score => {
    if (score.team === '226') return '#FE59D7';
    if (score.team === highlightedOverviewTeam) return '#ffaad3';
    return '#3EDBF0';
  });


  charts['algaeCyclesChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Cycles',
          data: algaeCycles,
          backgroundColor: algaeColors
        }
      ]
    },
    options: {
      onClick: getChartClickHandler(),
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: 3,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            beforeBody: function (tooltipItems) {
              const index = tooltipItems[0].dataIndex;
              const ranking = index + 1;
              return `Rank: ${ranking}`
            },
          },
          backgroundColor: '#1C1E21',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#000',
          borderWidth: 1,
          titleFont: { family: 'Lato', size: 14 },
          bodyFont: { family: 'Lato', size: 14 },
          padding: 10
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 12 },
            autoSkip: false,
            maxRotation: 45,
            minRotation: 45
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: 'white',
            font: { family: 'Lato', size: 14, weight: 'bold' }
          },
          grid: { display: false }
        }
      },
      layout: {
        padding: {
          left: 10,
          right: 10,
          top: 20,
          bottom: 50
        }
      }
    }
  });
}
function handleOverviewSearch() {
  const input = document.getElementById('overviewSearch').value.trim();
  document.getElementById('chartFilterDropdown').value = 'all';

  if (!input) return;

  highlightedOverviewTeam = input;
  const parsedData = parseCSV();
  renderOverviewStackedChart(parsedData.data, 'all');
  renderCoralCyclesChart(parsedData.data);
  renderAlgaeCyclesChart(parsedData.data);
}

function clearOverviewSearch() {
  document.getElementById('overviewSearch').value = '';
  document.getElementById('chartFilterDropdown').value = 'all';
  highlightedOverviewTeam = null;
  const parsedData = parseCSV();
  renderOverviewStackedChart(parsedData.data, 'all');
  renderCoralCyclesChart(parsedData.data);
  renderAlgaeCyclesChart(parsedData.data);
}


/*-----FILTER VIEW----*/

async function addHiddenTeam(e) {
  e.preventDefault();
  e.stopPropagation();

  const input = document.getElementById('hideTeamInput');
  const teamNumber = input.value.trim();
  const data = parseCSV().data;
  const teamExists = data.some(row => row['Team No.'] === teamNumber);

  if (!teamNumber) return;

  if (!teamExists) {
    alert(`No data found for team ${teamNumber}`);
    return;
  }

  if (!hiddenTeams.includes(teamNumber)) {
    hiddenTeams.push(teamNumber);
    hiddenTeams.sort((a, b) => parseInt(a) - parseInt(b));
    renderHiddenTeamsList();
    input.value = '';
  } else {
    alert(`Team ${teamNumber} is already in the list.`);
  }
}


function renderHiddenTeamsList() {
  const list = document.getElementById('hideTeamList');
  const container = document.getElementById('hideTeamListContainer');
  list.innerHTML = '';

  hiddenTeams.forEach(team => {
    const listItem = document.createElement('li');
    listItem.style.display = 'flex';
    listItem.style.justifyContent = 'space-between';
    listItem.style.alignItems = 'center';
    listItem.style.marginBottom = '8px';
    listItem.style.padding = '6px 10px';
    listItem.style.backgroundColor = '#1C1E21';
    listItem.style.borderRadius = '4px';
    listItem.style.border = '1px solid red';

    const teamText = document.createElement('span');
    teamText.textContent = `Team ${team}`;
    teamText.style.color = 'white';
    listItem.appendChild(teamText);

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'X';
    deleteButton.style.padding = '2px 8px';
    deleteButton.style.backgroundColor = '#ff5c5c';
    deleteButton.style.color = 'white';
    deleteButton.style.border = 'none';
    deleteButton.style.borderRadius = '4px';
    deleteButton.style.cursor = 'pointer';

    deleteButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hiddenTeams = hiddenTeams.filter(t => t !== team);
      renderHiddenTeamsList();
      applyFilters();
      adjustContainerHeight(container);
    });

    listItem.appendChild(deleteButton);
    list.appendChild(listItem);
  });

  adjustContainerHeight(container);
  applyFilters();

}

async function resetHiddenTeams(e) {
  e.preventDefault();
  e.stopPropagation();
  hiddenTeams = [];
  renderHiddenTeamsList();
  applyFilters();
};

async function toggleHiddenTeams() {
  showHiddenTeamsInFilter = !showHiddenTeamsInFilter;
  document.getElementById('toggleHiddenTeamsButton').textContent = showHiddenTeamsInFilter
    ? 'Hide Hidden Teams'
    : 'Show Hidden Teams';
  applyFilters();
}

function applyFilters() {
  const parsed = Papa.parse(csvText, { header: true }).data;
  const selectedFilters = Array.from(document.querySelectorAll('#filterCheckboxesContainer input[type="checkbox"]:checked')).map(cb => cb.value);
  const sortBy = document.getElementById('filterTeamsDropdown').value;

  const teamMap = {};
  const hasDeepClimbFilter = selectedFilters.includes('deepClimb');
  const hasShallowClimbFilter = selectedFilters.includes('shallowClimb');
  const hasBothClimbFilters = hasDeepClimbFilter && hasShallowClimbFilter;

  parsed.forEach(row => {
    const team = row['Team No.'];
    if (!team) return;
    if (!showHiddenTeamsInFilter && hiddenTeams.includes(team)) return;

    if (!teamMap[team]) {
      teamMap[team] = {
        matches: [],
        epaTotal: 0,
        matchCount: 0,
        coralCycles: [],
        algaeNetCycles: [],
        flags: new Set()
      };
    }

    const teleCoral =
      (parseInt(row['L1'] || 0)) +
      (parseInt(row['L2'] || 0)) +
      (parseInt(row['L3'] || 0)) +
      (parseInt(row['L4'] || 0));

    const teleAlgaeNet = parseInt(row['Algae in Net'] || 0);
    const totalScore = parseFloat(row['Total Score'] || 0);

    teamMap[team].matches.push(row);
    teamMap[team].epaTotal += totalScore;
    teamMap[team].matchCount++;
    teamMap[team].coralCycles.push(teleCoral);
    teamMap[team].algaeNetCycles.push(teleAlgaeNet);

    if (row['Auton Starting Position'] === 'c') teamMap[team].flags.add('centerAuto');
    if (parseInt(row['Auton L1'] || 0) > 0 || parseInt(row['L1'] || 0) > 0) teamMap[team].flags.add('L1');
    if (parseInt(row['Auton L2'] || 0) > 0 || parseInt(row['L2'] || 0) > 0) teamMap[team].flags.add('L2');
    if (parseInt(row['Auton L3'] || 0) > 0 || parseInt(row['L3'] || 0) > 0) teamMap[team].flags.add('L3');
    if (parseInt(row['Auton L4'] || 0) > 0 || parseInt(row['L4'] || 0) > 0) teamMap[team].flags.add('L4');
    if (parseInt(row['Auton Algae Removed'] || 0) > 0 || parseInt(row['Algae removed'] || 0) > 0) teamMap[team].flags.add('RemoveAlgae');
    if (parseInt(row['Auton Algae in Net'] || 0) > 0 || parseInt(row['Algae in Net'] || 0) > 0) teamMap[team].flags.add('BargeAlgae');
    if (parseInt(row['Auton Algae in Processor'] || 0) > 0 || parseInt(row['Algae in Processor'] || 0) > 0) teamMap[team].flags.add('ProcessorAlgae');
    if (parseFloat(row['Defense Rating'] || 0) > 0) teamMap[team].flags.add('defense');
    if (parseFloat(row['Climb Score'] || 0) === 12) teamMap[team].flags.add('deepClimb');
    if (parseFloat(row['Climb Score'] || 0) === 6) teamMap[team].flags.add('shallowClimb');
  });

  pitScoutingData.forEach(row => {
    const team = row['Team No.'];
    if (!showHiddenTeamsInFilter && hiddenTeams.includes(team)) return;
    if (!teamMap[team]) return;

    if (row['Ground Barge']) teamMap[team].flags.add('groundBarge');
    if (row['Ground Processor']) teamMap[team].flags.add('groundProcessor');
    if (typeof row['Drivetrain'] === 'string' && row['Drivetrain'].toLowerCase().includes('swerve')) {
      teamMap[team].flags.add('swerve');
    }
  });

  const allTeams = Object.entries(teamMap).map(([team, data]) => {
    const avgEPA = (data.epaTotal / data.matchCount).toFixed(1);
    const avgCoral = (data.coralCycles.reduce((a, b) => a + b, 0) / data.matchCount).toFixed(1);
    const maxCoral = Math.max(...data.coralCycles);
    const avgBarge = (data.algaeNetCycles.reduce((a, b) => a + b, 0) / data.matchCount).toFixed(1);
    const maxBarge = Math.max(...data.algaeNetCycles);

    return {
      team,
      avgEPA,
      avgCoral,
      maxCoral,
      avgBarge,
      maxBarge,
      flags: data.flags,
      isHidden: hiddenTeams.includes(team)
    };
  });

  const passed = allTeams.filter(team => {
    const climbPassed = hasBothClimbFilters
      ? (team.flags.has('deepClimb') || team.flags.has('shallowClimb'))
      : selectedFilters.every(f => {
        if (f === 'deepClimb' || f === 'shallowClimb') {
          return team.flags.has(f);
        }
        return true;
      });

    const othersPassed = selectedFilters
      .filter(f => f !== 'deepClimb' && f !== 'shallowClimb')
      .every(f => team.flags.has(f));

    return climbPassed && othersPassed;
  });

  const filteredIn = passed;
  const filteredOut = allTeams.filter(team => !passed.includes(team));

  let sortFn;
  switch (sortBy) {
    case 'EPA': sortFn = (a, b) => b.avgEPA - a.avgEPA; break;
    case 'avgCoral': sortFn = (a, b) => b.avgCoral - a.avgCoral || b.avgEPA - a.avgEPA; break;
    case 'maxCoral': sortFn = (a, b) => b.maxCoral - a.maxCoral || b.avgCoral - a.avgCoral; break;
    case 'avgBarge': sortFn = (a, b) => b.avgBarge - a.avgBarge || b.avgEPA - a.avgEPA; break;
    case 'maxBarge': sortFn = (a, b) => b.maxBarge - a.maxBarge || b.avgBarge - a.avgBarge; break;
    default: sortFn = (a, b) => b.avgEPA - a.avgEPA;
  }

  filteredIn.sort(sortFn);
  filteredOut.sort(sortFn);

  const container = document.getElementById('rankedTeamsContainer');
  container.innerHTML = '';

  const labelIn = document.createElement('div');
  labelIn.textContent = 'Matching Teams';
  labelIn.style.fontSize = '20px';
  labelIn.style.color = 'white';
  labelIn.style.margin = '10px 0 5px';
  labelIn.style.fontWeight = 'bold';
  labelIn.style.fontFamily = 'Lato';
  container.appendChild(labelIn);

  renderTeamGroup(filteredIn, container, sortBy);

  if (filteredOut.length > 0) {
    const divider = document.createElement('hr');
    divider.style.border = 'none';
    divider.style.borderTop = '2px solid #1e90ff';
    divider.style.margin = '40px 0 20px';
    container.appendChild(divider);

    const labelOut = document.createElement('div');
    labelOut.textContent = "Don't Match";
    labelOut.style.fontSize = '20px';
    labelOut.style.color = 'white';
    labelOut.style.marginBottom = '10px';
    labelIn.style.fontWeight = 'bold';
    labelIn.style.fontFamily = 'Lato';
    container.appendChild(labelOut);

    renderTeamGroup(filteredOut, container, sortBy);
  }
}

function renderTeamGroup(teams, container, sortBy) {
  const grid = document.createElement('div');
  grid.className = 'row';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
  grid.style.gap = '15px';

  teams.forEach(team => {
    const box = document.createElement('div');
    box.style.backgroundColor = team.isHidden ? '#2a2d31' : '#1C1E21';
    box.style.borderRadius = '12px';
    box.style.padding = '15px';
    box.style.color = 'white';
    box.style.boxShadow = '#131416 0px 0px 10px';
    box.style.textAlign = 'center';
    box.style.fontFamily = 'Lato';
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.justifyContent = 'center';
    box.style.alignItems = 'center';
    box.style.position = 'relative';

    if (team.isHidden) {
      const hiddenTag = document.createElement('div');
      hiddenTag.textContent = 'HIDDEN';
      hiddenTag.style.position = 'absolute';
      hiddenTag.style.top = '5px';
      hiddenTag.style.right = '5px';
      hiddenTag.style.backgroundColor = '#ff5c5c';
      hiddenTag.style.color = 'white';
      hiddenTag.style.fontSize = '10px';
      hiddenTag.style.padding = '2px 5px';
      hiddenTag.style.borderRadius = '3px';
      box.appendChild(hiddenTag);
    }

    let metricValue, metricLabel;
    switch (sortBy) {
      case 'EPA': metricValue = team.avgEPA; metricLabel = 'EPA'; break;
      case 'avgCoral': metricValue = team.avgCoral; metricLabel = 'Avg Coral'; break;
      case 'maxCoral': metricValue = team.maxCoral; metricLabel = 'Max Coral'; break;
      case 'avgBarge': metricValue = team.avgBarge; metricLabel = 'Avg Barge'; break;
      case 'maxBarge': metricValue = team.maxBarge; metricLabel = 'Max Barge'; break;
      default: metricValue = team.avgEPA; metricLabel = 'EPA';
    }

    box.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">Team ${team.team}</h3>
      <p style="margin: 5px 0;"><strong>${metricLabel}:</strong> ${metricValue}</p>
      <button class="blue-button" onclick="goToIndividualView('${team.team}')" style="margin-top: 10px;">View</button>
    `;

    grid.appendChild(box);
  });

  container.appendChild(grid);
}


function adjustContainerHeight(container) {
  const list = container.querySelector('ul');
  container.style.height = list.children.length > 0 ?
    `${list.scrollHeight + 10}px` : 'auto';
}


function goToIndividualView(teamNumber) {
  document.querySelector('.content').scrollTo({ top: 0, behavior: 'auto' });
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(button => button.classList.remove('active'));
  document.getElementById('individual').classList.add('active');
  document.querySelector('.tab[onclick*="individual"]').classList.add('active');
  document.getElementById('teamSearch').value = teamNumber;
  searchTeam();
}

/*-----TOGGLE EPA FILTER----*/
function toggleEPAAvg(chartId, showAvg) {
  if (!chartId) {
    const isChecked = document.querySelector('.hideEPAAvgComparison').checked;
    document.querySelectorAll('.hideEPAAvgComparison').forEach(cb => {
      cb.checked = isChecked;
    });

    if (charts['epaTrendTeam1']) {
      const chart1 = charts['epaTrendTeam1'];
      const avgDataset1 = chart1.data.datasets.find(d => d.label === 'Avg. EPA');
      if (avgDataset1) avgDataset1.hidden = !isChecked;
      chart1.update();
    }

    if (charts['epaTrendTeam2']) {
      const chart2 = charts['epaTrendTeam2'];
      const avgDataset2 = chart2.data.datasets.find(d => d.label === 'Avg. EPA');
      if (avgDataset2) avgDataset2.hidden = !isChecked;
      chart2.update();
    }
    return;
  }

  if (!charts[chartId]) return;
  const chart = charts[chartId];
  const avgDataset = chart.data.datasets.find(d => d.label === 'Avg. EPA');
  if (avgDataset) {
    avgDataset.hidden = !showAvg;
    chart.update();
  }
}
/*-----MATCH PREDICTOR FUNCTIONS----*/


function renderMatchPredictor() {
  const redTeams = [];
  const blueTeams = [];

  document.getElementById('matchPredictionResult').innerHTML = '';
  document.getElementById('matchStatsTable').innerHTML = '';

  for (let i = 1; i <= 3; i++) {
    const redTeam = document.getElementById(`redTeam${i}`).value.trim();
    const blueTeam = document.getElementById(`blueTeam${i}`).value.trim();

    if (redTeam) redTeams.push(redTeam);
    if (blueTeam) blueTeams.push(blueTeam);
  }

  renderMatchSummaryTable(redTeams, blueTeams);

  if (redTeams.length === 0 && blueTeams.length === 0) return;

  const parsedData = parseCSV().data;
  const allTeams = [...redTeams, ...blueTeams];

  const teamStats = {};

  allTeams.forEach(team => {
    const teamData = parsedData.filter(row => row['Team No.'] === team);
    if (teamData.length === 0) return;

    const stats = {
      auto: {
        modes: {},
        mostCommon: null,
        mostCommonStats: null
      },
      tele: {
        L1: 0, L2: 0, L3: 0, L4: 0,
        barge: 0, processor: 0, removed: 0
      },
      endgame: {
        deepClimb: 0,
        shallowClimb: 0,
        deepAttempts: 0,
        shallowAttempts: 0,
        deepClimbRate: '-',
        shallowClimbRate: '-'
      },
      epa: 0,
      matches: teamData.length
    };

    teamData.forEach(row => {
      const autoRun = {
        L1: parseInt(row['Auton L1'] || 0),
        L2: parseInt(row['Auton L2'] || 0),
        L3: parseInt(row['Auton L3'] || 0),
        L4: parseInt(row['Auton L4'] || 0),
        barge: parseInt(row['Auton Algae in Net'] || 0),
        processor: parseInt(row['Auton Algae in Processor'] || 0),
        removed: parseInt(row['Auton Algae Removed'] || 0),
        score: parseInt(row['Auton Score'] || 0)
      };

      const runKey = `${autoRun.L1}-${autoRun.L2}-${autoRun.L3}-${autoRun.L4}`;

      if (!stats.auto.modes[runKey]) {
        stats.auto.modes[runKey] = {
          count: 0,
          run: autoRun
        };
      }
      stats.auto.modes[runKey].count++;
    });

    let maxCount = 0;
    let bestScore = 0;
    let mostCommonRun = null;

    Object.values(stats.auto.modes).forEach(mode => {
      if (mode.count > maxCount ||
        (mode.count === maxCount && mode.run.score > bestScore)) {
        maxCount = mode.count;
        bestScore = mode.run.score;
        mostCommonRun = mode.run;
      }
    });

    if (mostCommonRun) {
      stats.auto.mostCommonStats = {
        L1: mostCommonRun.L1,
        L2: mostCommonRun.L2,
        L3: mostCommonRun.L3,
        L4: mostCommonRun.L4,
        barge: mostCommonRun.barge,
        processor: mostCommonRun.processor,
        removed: mostCommonRun.removed
      };
    }

    teamData.forEach(row => {
      stats.tele.L1 += parseInt(row['L1'] || 0);
      stats.tele.L2 += parseInt(row['L2'] || 0);
      stats.tele.L3 += parseInt(row['L3'] || 0);
      stats.tele.L4 += parseInt(row['L4'] || 0);
      stats.tele.barge += parseInt(row['Algae in Net'] || 0);
      stats.tele.processor += parseInt(row['Algae in Processor'] || 0);
      stats.tele.removed += parseInt(row['Algae removed'] || 0);

      const climbScore = parseFloat(row['Climb Score'] || 0);

      if (climbScore === 12 || climbScore === 2.1) {
        stats.endgame.deepAttempts++;
        if (climbScore === 12) stats.endgame.deepClimb++;
      }

      if (climbScore === 6 || climbScore === 2.1) {
        stats.endgame.shallowAttempts++;
        if (climbScore === 6) stats.endgame.shallowClimb++;
      }

      stats.epa += parseFloat(row['Total Score'] || 0);
    });

    if (stats.matches > 0) {
      stats.tele.L1 = (stats.tele.L1 / stats.matches).toFixed(1);
      stats.tele.L2 = (stats.tele.L2 / stats.matches).toFixed(1);
      stats.tele.L3 = (stats.tele.L3 / stats.matches).toFixed(1);
      stats.tele.L4 = (stats.tele.L4 / stats.matches).toFixed(1);
      stats.tele.barge = (stats.tele.barge / stats.matches).toFixed(1);
      stats.tele.processor = (stats.tele.processor / stats.matches).toFixed(1);
      stats.tele.removed = (stats.tele.removed / stats.matches).toFixed(1);

      if (stats.endgame.deepAttempts > 0) {
        stats.endgame.deepClimbRate = (stats.endgame.deepClimb / stats.endgame.deepAttempts * 100).toFixed(1) + '%';
      }
      if (stats.endgame.shallowAttempts > 0) {
        stats.endgame.shallowClimbRate = (stats.endgame.shallowClimb / stats.endgame.shallowAttempts * 100).toFixed(1) + '%';
      }

      stats.epa = (stats.epa / stats.matches).toFixed(1);
    }

    teamStats[team] = stats;
  });

  let redEPA = 0, blueEPA = 0;

  redTeams.forEach(team => {
    if (teamStats[team]) redEPA += parseFloat(teamStats[team].epa);
  });

  blueTeams.forEach(team => {
    if (teamStats[team]) blueEPA += parseFloat(teamStats[team].epa);
  });

  const resultDiv = document.getElementById('matchPredictionResult');
  const isTie = redEPA === blueEPA;
  const redWins = redEPA > blueEPA;

  resultDiv.innerHTML = `
  <div class="alliance-prediction" style="flex: 1; text-align: center; padding: 15px; 
        border-radius: 8px; ${isTie
      ? 'background-color: #FFD70030; border: 2px solid #FFD700;'
      : redWins
        ? 'background-color: #ff5c5c30; border: 2px solid #ff5c5c;'
        : ''
    }">
    <h3 style="margin: 0 0 10px 0; color: ${redWins ? '#ff5c5c' : isTie ? '#FFD700' : 'white'};">Red Alliance</h3>
    <p style="margin: 5px 0;">${redTeams.join(', ')}</p>
    <p class="epa-total" style="font-size: 24px; font-weight: bold; margin: 10px 0 0 0; 
          color: ${redWins ? '#ff5c5c' : isTie ? '#FFD700' : 'white'};">${redEPA.toFixed(1)} EPA</p>
  </div>
  <div class="vs-divider" style="font-size: 24px; font-weight: bold; color: white;">VS</div>
  <div class="alliance-prediction" style="flex: 1; text-align: center; padding: 15px; 
        border-radius: 8px; ${isTie
      ? 'background-color: #FFD70030; border: 2px solid #FFD700;'
      : !redWins
        ? 'background-color: #3EDBF030; border: 2px solid #3EDBF0;'
        : ''
    }">
<h3 style="margin: 0 0 10px 0; color: ${isTie ? '#FFD700' : !redWins ? '#3EDBF0' : 'white'};">Blue Alliance</h3>
    <p style="margin: 5px 0;">${blueTeams.join(', ')}</p>
  <p class="epa-total" style="font-size: 24px; font-weight: bold; margin: 10px 0 0 0; 
      color: ${isTie ? '#FFD700' : !redWins ? '#3EDBF0' : 'white'};">${blueEPA.toFixed(1)} EPA</p>
  </div>
`;

  const table = document.getElementById('matchStatsTable');
  table.innerHTML = '';

  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th style="background-color: #1C1E21; color: white; text-align: center; padding: 8px; width: 150px;">Stat</th>
    ${redTeams.map(team => `
      <th style="background-color: #ff5c5c30; color: white; padding: 8px; text-align: center; min-width: 80px;">
        ${team}
      </th>
    `).join('')}
    ${blueTeams.map(team => `
      <th style="background-color: #3EDBF030; color: white; padding: 8px; text-align: center; min-width: 80px;">
        ${team}
      </th>
    `).join('')}
  `;
  table.appendChild(headerRow);

  const autoHeader = document.createElement('tr');
  autoHeader.innerHTML = `
    <td colspan="${redTeams.length + blueTeams.length + 1}" 
        style="background-color: #2a2d31; color: white; font-weight: bold; padding: 8px;">
      Autonomous (Most Common Run)
    </td>
  `;
  table.appendChild(autoHeader);

  ['L1', 'L2', 'L3', 'L4'].forEach(level => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="background-color: #1C1E21; color: white; padding: 8px; text-align: left;">Auto ${level}</td>
      ${redTeams.map(team => `
        <td style="background-color: #ff5c5c30; color: white; padding: 8px; text-align: center;">
          ${teamStats[team]?.auto.mostCommonStats ? teamStats[team].auto.mostCommonStats[level] : '0'}
        </td>
      `).join('')}
      ${blueTeams.map(team => `
        <td style="background-color: #3EDBF030; color: white; padding: 8px; text-align: center;">
          ${teamStats[team]?.auto.mostCommonStats ? teamStats[team].auto.mostCommonStats[level] : '0'}
        </td>
      `).join('')}
    `;
    table.appendChild(row);
  });

  ['Barge', 'Processor', 'Removed'].forEach(type => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="background-color: #1C1E21; color: white; padding: 8px; text-align: left;">Auto ${type}</td>
      ${redTeams.map(team => `
        <td style="background-color: #ff5c5c30; color: white; padding: 8px; text-align: center;">
          ${teamStats[team]?.auto.mostCommonStats ? teamStats[team].auto.mostCommonStats[type.toLowerCase()] : '0'}
        </td>
      `).join('')}
      ${blueTeams.map(team => `
        <td style="background-color: #3EDBF030; color: white; padding: 8px; text-align: center;">
          ${teamStats[team]?.auto.mostCommonStats ? teamStats[team].auto.mostCommonStats[type.toLowerCase()] : '0'}
        </td>
      `).join('')}
    `;
    table.appendChild(row);
  });

  const teleHeader = document.createElement('tr');
  teleHeader.innerHTML = `
    <td colspan="${redTeams.length + blueTeams.length + 1}" 
        style="background-color: #2a2d31; color: white; font-weight: bold; padding: 8px;">
      TeleOp (Averages)
    </td>
  `;
  table.appendChild(teleHeader);

  ['L1', 'L2', 'L3', 'L4'].forEach(level => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="background-color: #1C1E21; color: white; padding: 8px; text-align: left;">Tele ${level}</td>
      ${redTeams.map(team => `
        <td style="background-color: #ff5c5c30; color: white; padding: 8px; text-align: center;">
          ${teamStats[team]?.tele[level] || '0.0'}
        </td>
      `).join('')}
      ${blueTeams.map(team => `
        <td style="background-color: #3EDBF030; color: white; padding: 8px; text-align: center;">
          ${teamStats[team]?.tele[level] || '0.0'}
        </td>
      `).join('')}
    `;
    table.appendChild(row);
  });

  ['Barge', 'Processor', 'Removed'].forEach(type => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="background-color: #1C1E21; color: white; padding: 8px; text-align: left;">Tele ${type}</td>
      ${redTeams.map(team => `
        <td style="background-color: #ff5c5c30; color: white; padding: 8px; text-align: center;">
          ${teamStats[team]?.tele[type.toLowerCase()] || '0.0'}
        </td>
      `).join('')}
      ${blueTeams.map(team => `
        <td style="background-color: #3EDBF030; color: white; padding: 8px; text-align: center;">
          ${teamStats[team]?.tele[type.toLowerCase()] || '0.0'}
        </td>
      `).join('')}
    `;
    table.appendChild(row);
  });

  const endgameHeader = document.createElement('tr');
  endgameHeader.innerHTML = `
    <td colspan="${redTeams.length + blueTeams.length + 1}" 
        style="background-color: #2a2d31; color: white; font-weight: bold; padding: 8px;">
      End Game
    </td>
  `;
  table.appendChild(endgameHeader);

  const deepClimbRow = document.createElement('tr');
  deepClimbRow.innerHTML = `
    <td style="background-color: #1C1E21; color: white; padding: 8px; text-align: left;">Deep Climb</td>
    ${redTeams.map(team => `
      <td style="background-color: #ff5c5c30; color: white; padding: 8px; text-align: center;">
        ${teamStats[team]?.endgame.deepClimbRate || '-'}
      </td>
    `).join('')}
    ${blueTeams.map(team => `
      <td style="background-color: #3EDBF030; color: white; padding: 8px; text-align: center;">
        ${teamStats[team]?.endgame.deepClimbRate || '-'}
      </td>
    `).join('')}
  `;
  table.appendChild(deepClimbRow);

  const shallowClimbRow = document.createElement('tr');
  shallowClimbRow.innerHTML = `
    <td style="background-color: #1C1E21; color: white; padding: 8px; text-align: left;">Shallow Climb</td>
    ${redTeams.map(team => `
      <td style="background-color: #ff5c5c30; color: white; padding: 8px; text-align: center;">
        ${teamStats[team]?.endgame.shallowClimbRate || '-'}
      </td>
    `).join('')}
    ${blueTeams.map(team => `
      <td style="background-color: #3EDBF030; color: white; padding: 8px; text-align: center;">
        ${teamStats[team]?.endgame.shallowClimbRate || '-'}
      </td>
    `).join('')}
  `;
  table.appendChild(shallowClimbRow);

  const epaRow = document.createElement('tr');
  epaRow.innerHTML = `
    <td style="background-color: #1C1E21; color: white; font-weight: bold; padding: 8px; text-align: left;">EPA</td>
    ${redTeams.map(team => `
      <td style="background-color: #ff5c5c30; color: white; font-weight: bold; padding: 8px; text-align: center;">
        ${teamStats[team]?.epa || '0.0'}
      </td>
    `).join('')}
    ${blueTeams.map(team => `
      <td style="background-color: #3EDBF030; color: white; font-weight: bold; padding: 8px; text-align: center;">
        ${teamStats[team]?.epa || '0.0'}
      </td>
    `).join('')}
  `;
  table.appendChild(epaRow);
}
function createStatsTable(redTeams, blueTeams, teamStats) {
  const table = document.getElementById('matchStatsTable');
  table.innerHTML = '';

  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
  <th style="background-color: #1C1E21; color: white; text-align: left; padding: 8px; width: 150px;">Stat</th>
  ${redTeams.map(team => `
    <th style="background-color: #ff5c5c30; color: white; padding: 8px; text-align: center; min-width: 80px;">
      ${team}
    </th>
  `).join('')}
  ${blueTeams.map(team => `
    <th style="background-color: #3EDBF030; color: white; padding: 8px; text-align: center; min-width: 80px;">
      ${team}
    </th>
  `).join('')}
`;
  table.appendChild(headerRow);

  addStatRows('Autonomous', [
    'Auto L1', 'Auto L2', 'Auto L3', 'Auto L4',
    'Auto Barge', 'Auto Processor'
  ], 'auto', table, redTeams, blueTeams, teamStats);

  addStatRows('TeleOp', [
    'Tele L1', 'Tele L2', 'Tele L3', 'Tele L4',
    'Tele Barge', 'Tele Processor'
  ], 'tele', table, redTeams, blueTeams, teamStats);

  addStatRows('End Game', [
    'Deep Climb', 'Shallow Climb'
  ], 'endgame', table, redTeams, blueTeams, teamStats);

  const epaRow = document.createElement('tr');
  epaRow.innerHTML = `
    <td style="background-color: #1C1E21; color: white; font-weight: bold; padding: 8px;">EPA</td>
    ${redTeams.map(team => `<td style="padding: 8px;">${teamStats[team]?.epa || 'N/A'}</td>`).join('')}
    ${blueTeams.map(team => `<td style="padding: 8px;">${teamStats[team]?.epa || 'N/A'}</td>`).join('')}
  `;
  table.appendChild(epaRow);
}

function addStatRows(category, stats, statType, table, redTeams, blueTeams, teamStats) {
  const categoryRow = document.createElement('tr');
  categoryRow.innerHTML = `
    <td colspan="${redTeams.length + blueTeams.length + 1}" 
        style="background-color: #2a2d31; color: white; font-weight: bold; padding: 8px;">
      ${category}
    </td>
  `;
  table.appendChild(categoryRow);

  stats.forEach(stat => {
    const statKey = stat.toLowerCase().replace(' ', '');
    const row = document.createElement('tr');

    row.innerHTML = `
      <td style="background-color: #1C1E21; color: white; padding: 8px;">${stat}</td>
      ${redTeams.map(team => `
        <td style="background-color: #ff5c5c30; color: white; padding: 8px;">
          ${teamStats[team]?.[statType]?.[statKey] || 'N/A'}
        </td>
      `).join('')}
      ${blueTeams.map(team => `
        <td style="background-color: #3EDBF030; color: white; padding: 8px;">
          ${teamStats[team]?.[statType]?.[statKey] || 'N/A'}
        </td>
      `).join('')}
    `;

    table.appendChild(row);
  });
}

function addStatRows(category, stats, statType, table, redTeams, blueTeams, teamStats) {
  const categoryRow = document.createElement('tr');
  categoryRow.innerHTML = `
    <td colspan="${redTeams.length + blueTeams.length + 1}" 
        style="background-color: #2a2d31; color: white; font-weight: bold; padding: 8px;">
      ${category}
    </td>
  `;
  table.appendChild(categoryRow);

  stats.forEach(stat => {
    const statKey = stat.toLowerCase().replace(' ', '');
    const row = document.createElement('tr');

    row.innerHTML = `
      <td style="background-color: #1C1E21; color: white; padding: 8px;">${stat}</td>
      ${redTeams.map(team => `
        <td style="background-color: #ff5c5c30; color: white;">
          ${teamStats[team]?.[statType]?.[statKey] || 'N/A'}
        </td>
      `).join('')}
      ${blueTeams.map(team => `
        <td style="background-color: #3EDBF030; color: white;">
          ${teamStats[team]?.[statType]?.[statKey] || 'N/A'}
        </td>
      `).join('')}
    `;

    table.appendChild(row);
  });
}

function toggleStatsTable() {
  const container = document.getElementById('matchStatsTableContainer');
  const arrow = document.getElementById('statsToggleArrow');
  const isExpanded = container.classList.toggle('expanded');
  arrow.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
}

function toggleMatchSummaryTable() {
  const container = document.getElementById('matchSummaryTableContainer');
  const arrow = document.getElementById('matchSummaryToggleArrow');
  const isExpanded = container.classList.toggle('expanded');
  arrow.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
}

function renderMatchSummaryTable(redTeams, blueTeams) {
  const parsedData = parseCSV().data;
  const tbody = document.getElementById('matchSummaryBody');
  tbody.innerHTML = '';

  const allTeams = [...redTeams, ...blueTeams];

  allTeams.forEach((team, index) => {
    const teamData = parsedData.filter(row => row['Team No.'] === team);
    if (teamData.length === 0) return;

    const stats = calculateTeamStatsForSummary(teamData);

    const levels = ['L4', 'L3', 'L2', 'L1'];
    const teleStats = levels.map(level => {
      const vals = teamData.map(row => parseInt(row[level] || 0));
      return {
        level,
        max: Math.max(...vals),
        avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
      };
    });

    const bargeVals = teamData.map(row => parseInt(row['Algae in Net'] || 0));
    const processorVals = teamData.map(row => parseInt(row['Algae in Processor'] || 0));
    const algaeVals = teamData.map(row =>
      (parseInt(row['Algae in Net'] || 0) || 0) +
      (parseInt(row['Algae in Processor'] || 0) || 0)
    ); const barge = { max: Math.max(...bargeVals), avg: (bargeVals.reduce((a, b) => a + b, 0) / bargeVals.length).toFixed(1) };
    const processor = { max: Math.max(...processorVals), avg: (processorVals.reduce((a, b) => a + b, 0) / processorVals.length).toFixed(1) };
    const algae = { max: Math.max(...algaeVals), avg: (algaeVals.reduce((a, b) => a + b, 0) / algaeVals.length).toFixed(1) };

    const diedMatches = teamData.filter(row => row['Died or Immobilized'] === '1').map(row => row['Match']);
    const diedPct = diedMatches.length > 0 ? ((diedMatches.length / teamData.length) * 100).toFixed(1) : null;

    let tooltipHTML = `
  <div class="custom-tooltip-content">
    <div class="tooltip-col">
      <div class="tooltip-header">Coral</div>
      <div class="tooltip-row"><b>L4:</b> ${teleStats[0].max} / ${teleStats[0].avg}</div>
      <div class="tooltip-row"><b>L3:</b> ${teleStats[1].max} / ${teleStats[1].avg}</div>
      <div class="tooltip-row"><b>L2:</b> ${teleStats[2].max} / ${teleStats[2].avg}</div>
      <div class="tooltip-row"><b>L1:</b> ${teleStats[3].max} / ${teleStats[3].avg}</div>
    </div>
    <div class="tooltip-col">
      <div class="tooltip-header">Algae</div>
      <div class="tooltip-row"><b>Barge:</b> ${barge.max} / ${barge.avg}</div>
      <div class="tooltip-row"><b>Processor:</b> ${processor.max} / ${processor.avg}</div>
      <div class="tooltip-row"><b>Algae:</b> ${algae.max} / ${algae.avg}</div>
    </div>
    ${diedPct ? `
    <div class="tooltip-col">
      <div class="tooltip-header">Died</div>
      <div class="tooltip-row"><b>Robot Died:</b> ${diedPct}%</div>
      <div class="tooltip-row"><b>Matches:</b> ${diedMatches.map(m => 'Q' + m).join(', ')}</div>
    </div>
    ` : ''}
  </div>
  <div style="width:100%;font-size:12px; font-family:Lato;color:#aaa;margin-top:10px;text-align:right;">
    * game pieces are shown as max / avg
  </div>
`;

    const row = document.createElement('tr');
    const hasDied = diedMatches.length > 0;
    const teamDisplay = hasDied ? `⚠️${team}⚠️` : team;
    const teamCellStyle = index < redTeams.length ?
      'background-color: #ff5c5c30;' : 'background-color: #3EDBF030;';

    row.innerHTML = `
            <td style="${teamCellStyle} padding: 8px; font-weight: bold; position:relative; cursor:pointer;">
                <span class="team-tooltip-trigger">${teamDisplay}
                    <span class="custom-tooltip" style="display:none; position:absolute; left:100%; top:0; z-index:10; background:#222; color:#fff; border-radius:8px; padding:12px; font-size:13px; box-shadow:0 2px 8px #000a;">
                        ${tooltipHTML}
                    </span>
                </span>
            </td>
            <td style="padding: 8px; text-align: center;">${stats.epa}</td>
            <td style="padding: 8px; text-align: center;">${stats.avgCycles}</td>
            <td style="padding: 8px; text-align: center;">${stats.mostCommonScoring}</td>
            <td style="padding: 8px; text-align: center;">${stats.secondCommonScoring}</td>
            <td style="padding: 8px; text-align: center;">${stats.canNet ? '✅' : '❌'}</td>
            <td style="padding: 8px; text-align: center;">${stats.canProcess ? '✅' : '❌'}</td>
            <td style="padding: 8px; text-align: center;">${stats.climbRate}</td>
            <td style="padding: 8px; text-align: center;">${stats.defenseRating}</td>
            <td style="padding: 8px; text-align: center;">${stats.defenseRank}</td>
        `;

    tbody.appendChild(row);
  });

  setTimeout(() => {
    document.querySelectorAll('.team-tooltip-trigger').forEach(trigger => {
      trigger.onmouseenter = (e) => {
        const tooltip = document.getElementById('global-tooltip');
        const customTooltip = trigger.querySelector('.custom-tooltip');
        tooltip.innerHTML = customTooltip.innerHTML;
        tooltip.style.display = 'block';

        const rect = trigger.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        let top = rect.bottom + 8;
        let left = rect.left;

        if (top + tooltipRect.height > window.innerHeight) {
          top = rect.top - tooltipRect.height - 8;
        }
        if (left + tooltipRect.width > window.innerWidth) {
          left = window.innerWidth - tooltipRect.width - 8;
        }
        if (left < 0) left = 8;
        if (top < 0) top = 8;

        tooltip.style.position = 'fixed';
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.style.zIndex = 99999;
      };
      trigger.onmouseleave = () => {
        const tooltip = document.getElementById('global-tooltip');
        tooltip.style.display = 'none';
      };
    });
  }, 0);
}

function calculateTeamStatsForSummary(teamData) {
  const totalEPA = teamData.reduce((sum, row) => sum + (parseFloat(row['Total Score']) || 0), 0);
  const avgEPA = (totalEPA / teamData.length).toFixed(1);

  const teleCycles = teamData.map(row =>
  (parseInt(row['L1'] || 0) +
    parseInt(row['L2'] || 0) +
    parseInt(row['L3'] || 0) +
    parseInt(row['L4'] || 0))
  );
  const avgCycles = (teleCycles.reduce((a, b) => a + b, 0) / teamData.length).toFixed(1);

  const scoringCounts = { L1: 0, L2: 0, L3: 0, L4: 0 };
  teamData.forEach(row => {
    if (parseInt(row['L1'] || 0) > 0) scoringCounts.L1++;
    if (parseInt(row['L2'] || 0) > 0) scoringCounts.L2++;
    if (parseInt(row['L3'] || 0) > 0) scoringCounts.L3++;
    if (parseInt(row['L4'] || 0) > 0) scoringCounts.L4++;
  });
  const sortedScoring = Object.entries(scoringCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(entry => entry[1] > 0);
  const mostCommonScoring = sortedScoring.length > 0 ? sortedScoring[0][0] : 'N/A';
  const secondCommonScoring = sortedScoring.length > 1 ? sortedScoring[1][0] : 'N/A';

  const canNet = teamData.some(row => parseInt(row['Algae in Net'] || 0) > 0);
  const canProcess = teamData.some(row => parseInt(row['Algae in Processor'] || 0) > 0);

  const climbScores = teamData.map(row => parseFloat(row['Climb Score'] || 0));
  const successfulClimbs = climbScores.filter(score => score === 12 || score === 6).length;
  const climbAttempts = climbScores.filter(score => score === 12 || score === 6 || score === 2.1).length;
  const climbRate = climbAttempts > 0 ?
    ((successfulClimbs / climbAttempts) * 100).toFixed(1) + '%' : 'N/A';

  let defenseRank = 'N/A';
  try {
    const parsed = parseCSV();
    const data = parsed.data;
    const matches = {};
    const teamMatches = {};
    const robotDiedMap = {};

    data.forEach(row => {
      const match = row['Match'];
      const teamNumber = row['Team No.'];
      const died = row['Died or Immobilized'] === '1';
      if (match && teamNumber) {
        if (!robotDiedMap[match]) robotDiedMap[match] = new Set();
        if (died) robotDiedMap[match].add(teamNumber);
      }
    });

    data.forEach(row => {
      const match = row['Match'];
      const teamNumber = row['Team No.'];
      const robotColor = row['Robot Color'];
      const totalScore = parseFloat(row['Total Score']) || 0;
      if (!match || !teamNumber || !robotColor) return;
      if (!matches[match]) matches[match] = { red: [], blue: [] };
      const alliance = robotColor.toLowerCase().startsWith('red') ? 'red' : 'blue';
      matches[match][alliance].push({ teamNumber, totalScore });
      if (!teamMatches[teamNumber]) teamMatches[teamNumber] = [];
      teamMatches[teamNumber].push({ match, alliance, totalScore });
    });

    const allianceEPAs = {};
    const teamDefenseImpact = {};
    const defenseMatchCount = {};

    Object.entries(matches).forEach(([match, { red, blue }]) => {
      if (red.length !== 3 || blue.length !== 3) return;
      const redEPA = red.reduce((sum, t) => sum + t.totalScore, 0);
      const blueEPA = blue.reduce((sum, t) => sum + t.totalScore, 0);
      allianceEPAs[match] = { redEPA, blueEPA };
    });

    data.forEach(row => {
      const teamNumber = row['Team No.'];
      const match = row['Match'];
      const robotColor = row['Robot Color'];
      const defenseRating = parseFloat(row['Defense Rating']);
      if (!match || !teamNumber || isNaN(defenseRating) || defenseRating <= 0) return;
      const isRed = robotColor.toLowerCase().startsWith('red');
      const defendingAgainst = isRed ? 'blue' : 'red';
      const thisMatch = matches[match];
      if (!thisMatch || thisMatch.red.length !== 3 || thisMatch.blue.length !== 3) return;
      const diedRobots = robotDiedMap[match] || new Set();
      const opponentTeams = thisMatch[defendingAgainst].map(t => t.teamNumber);
      const anyOpponentDied = opponentTeams.some(team => diedRobots.has(team));
      if (anyOpponentDied) return;
      const opponentEPAInMatch = allianceEPAs[match][`${defendingAgainst}EPA`];
      let totalOpponentEPA = 0;
      let opponentMatchCount = 0;
      opponentTeams.forEach(opponent => {
        const games = teamMatches[opponent];
        games.forEach(g => {
          if (g.match !== match) {
            const comparisonDiedRobots = robotDiedMap[g.match] || new Set();
            if (!comparisonDiedRobots.has(opponent)) {
              const allianceScore = allianceEPAs[g.match]?.[`${g.alliance}EPA`];
              if (!isNaN(allianceScore)) {
                totalOpponentEPA += allianceScore;
                opponentMatchCount++;
              }
            }
          }
        });
      });
      if (opponentMatchCount === 0) return;
      const avgOpponentEPA = totalOpponentEPA / opponentMatchCount;
      const impact = avgOpponentEPA - opponentEPAInMatch;
      if (!teamDefenseImpact[teamNumber]) {
        teamDefenseImpact[teamNumber] = 0;
        defenseMatchCount[teamNumber] = 0;
      }
      teamDefenseImpact[teamNumber] += impact;
      defenseMatchCount[teamNumber]++;
    });

    const rankings = Object.keys(teamDefenseImpact).map(team => {
      const matches = defenseMatchCount[team];
      return {
        team,
        avgImpact: matches > 0 ? teamDefenseImpact[team] / matches : 0,
        matchesCount: matches
      };
    });

    rankings.sort((a, b) => b.avgImpact - a.avgImpact);
    rankings.forEach((entry, i) => entry.rank = i + 1);

    const teamNum = teamData[0]['Team No.'].toString().trim();
    const found = rankings.find(t => t.team === teamNum);
    if (found) {
      defenseRank = `${found.rank}/${rankings.length}`;
    }
  } catch (e) {
    defenseRank = 'N/A';
  }

  const ratings = teamData.map(row => parseFloat(row['Defense Rating'])).filter(n => !isNaN(n));
  let defenseRating = 'N/A';
  if (ratings.length > 0) {
    const freq = {};
    ratings.forEach(r => freq[r] = (freq[r] || 0) + 1);
    let mode = ratings[0], maxCount = 0;
    for (const r in freq) {
      if (freq[r] > maxCount) {
        maxCount = freq[r];
        mode = r;
      }
    }
    defenseRating = mode;
  }

  return {
    epa: avgEPA,
    avgCycles,
    mostCommonScoring,
    secondCommonScoring,
    canNet,
    canProcess,
    climbRate,
    defenseRating,
    defenseRank
  };
}

/*-----ALLIANCE COMPARISON FUNCTIONS-----*/

function openAllianceComparison(alliance) {
  const popup = document.getElementById('allianceComparisonPopup');
  const title = document.getElementById('allianceComparisonTitle');
  const content = document.getElementById('allianceComparisonContent');

  content.innerHTML = '';

  const teamNumbers = [];
  for (let i = 1; i <= 3; i++) {
    const team = document.getElementById(`${alliance}Team${i}`).value.trim();
    if (team) teamNumbers.push(team);
  }

  if (teamNumbers.length === 0) {
    alert(`Please enter at least one team for the ${alliance} alliance`);
    return;
  }

  title.textContent = `${alliance.toUpperCase()} Alliance Comparison: ${teamNumbers.join(', ')}`;
  title.style.color = alliance === 'red' ? '#ff5c5c' : '#3EDBF0';

  teamNumbers.forEach((team, index) => {
    const teamData = filterTeamData(team);
    if (teamData.length === 0) return;

    const teamContainer = document.createElement('div');
    teamContainer.style.backgroundColor = '#2a2d31';
    teamContainer.style.borderRadius = '8px';
    teamContainer.style.padding = '15px';
    teamContainer.style.color = 'white';

    const teamHeader = document.createElement('div');
    teamHeader.style.display = 'flex';
    teamHeader.style.justifyContent = 'space-between';
    teamHeader.style.alignItems = 'center';
    teamHeader.style.marginBottom = '15px';

    const teamTitle = document.createElement('h3');
    teamTitle.textContent = `Team ${team}`;
    teamTitle.style.margin = '0';
    teamTitle.style.color = alliance === 'red' ? '#ff5c5c' : '#3EDBF0';

    teamHeader.appendChild(teamTitle);
    teamContainer.appendChild(teamHeader);

    const statsContainer = document.createElement('div');
    statsContainer.style.marginBottom = '15px';

    const stats = calculateTeamStats(teamData);
    statsContainer.innerHTML = `
      <div style="margin-bottom: 10px;">
        <strong>EPA:</strong> ${stats.epa}<br>
        <strong>Avg Coral:</strong> ${stats.avgCoral}<br>
        <strong>Avg Algae:</strong> ${stats.avgAlgae}
      </div>
      <div>
        <strong>Climb Success:</strong> ${stats.climbSuccessRate}%<br>
        <strong>Robot Died:</strong> ${stats.robotDiedRate}%
      </div>
    `;
    teamContainer.appendChild(statsContainer);

    const chartsContainer = document.createElement('div');
    chartsContainer.style.display = 'flex';
    chartsContainer.style.flexDirection = 'column';
    chartsContainer.style.gap = '15px';

    const autoCoralCanvas = document.createElement('canvas');
    autoCoralCanvas.id = `allianceAutoCoral${index}`;
    autoCoralCanvas.style.width = '100%';
    autoCoralCanvas.style.height = '200px';

    const autoAlgaeCanvas = document.createElement('canvas');
    autoAlgaeCanvas.id = `allianceAutoAlgae${index}`;
    autoAlgaeCanvas.style.width = '100%';
    autoAlgaeCanvas.style.height = '200px';

    const teleCoralCanvas = document.createElement('canvas');
    teleCoralCanvas.id = `allianceTeleCoral${index}`;
    teleCoralCanvas.style.width = '100%';
    teleCoralCanvas.style.height = '200px';

    const teleAlgaeCanvas = document.createElement('canvas');
    teleAlgaeCanvas.id = `allianceTeleAlgae${index}`;
    teleAlgaeCanvas.style.width = '100%';
    teleAlgaeCanvas.style.height = '200px';

    const epaTrendCanvas = document.createElement('canvas');
    epaTrendCanvas.id = `allianceEPATrend${index}`;
    epaTrendCanvas.style.width = '100%';
    epaTrendCanvas.style.height = '200px';

    const addChartTitle = (container, title) => {
      const titleDiv = document.createElement('div');
      titleDiv.textContent = title;
      titleDiv.style.fontWeight = 'bold';
      titleDiv.style.marginBottom = '5px';
      titleDiv.style.color = '#ccc';
      container.appendChild(titleDiv);
    };

    addChartTitle(chartsContainer, 'Auto Coral');
    chartsContainer.appendChild(autoCoralCanvas);

    addChartTitle(chartsContainer, 'Auto Algae');
    chartsContainer.appendChild(autoAlgaeCanvas);

    addChartTitle(chartsContainer, 'Tele Coral');
    chartsContainer.appendChild(teleCoralCanvas);

    addChartTitle(chartsContainer, 'Tele Algae');
    chartsContainer.appendChild(teleAlgaeCanvas);

    addChartTitle(chartsContainer, 'EPA Trend');
    chartsContainer.appendChild(epaTrendCanvas);

    teamContainer.appendChild(chartsContainer);
    content.appendChild(teamContainer);

    const allTeamData = teamNumbers.map(t => filterTeamData(t));
    const maxTeleCoral = getMaxTeleCoral(...allTeamData);
    const maxTeleAlgae = getMaxTeleAlgae(...allTeamData);
    const maxEPA = getMaxEPA(...allTeamData);
    const maxAutoCoral = getMaxAutoCoral(...allTeamData);
    const maxAutoAlgae = getMaxAutoAlgae(...allTeamData);

    renderAutoCoralChartForTeam(teamData, `allianceAutoCoral${index}`, maxAutoCoral);
    renderAutoAlgaeChartForTeam(teamData, `allianceAutoAlgae${index}`, maxAutoAlgae);
    renderTeleCoralChartForTeam(teamData, `allianceTeleCoral${index}`, maxTeleCoral);
    renderTeleAlgaeChartForTeam(teamData, `allianceTeleAlgae${index}`, maxTeleAlgae);
    renderEPATrendChartForTeam(teamData, `allianceEPATrend${index}`, maxEPA);
  });

  popup.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeAllianceComparison() {
  const popup = document.getElementById('allianceComparisonPopup');
  popup.style.display = 'none';
  document.body.style.overflow = 'auto';

  const chartIds = [
    'allianceAutoCoral0', 'allianceAutoCoral1', 'allianceAutoCoral2',
    'allianceTeleCoral0', 'allianceTeleCoral1', 'allianceTeleCoral2',
    'allianceTeleAlgae0', 'allianceTeleAlgae1', 'allianceTeleAlgae2',
    'allianceEPATrend0', 'allianceEPATrend1', 'allianceEPATrend2'
  ];

  chartIds.forEach(id => {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  });
}

function calculateTeamStats(teamData) {
  if (!teamData || teamData.length === 0) return {};

  const climbScores = teamData.map(row => parseFloat(row['Climb Score'] || 0));
  const successfulClimbs = climbScores.filter(score => score === 12 || score === 6).length;
  const totalClimbAttempts = climbScores.filter(score => score === 12 || score === 6 || score === 2.1).length;
  const climbSuccessRate = totalClimbAttempts > 0 ? (successfulClimbs / totalClimbAttempts * 100).toFixed(1) : "0.0";
  const robotDiedRate = (teamData.filter(row => row['Died or Immobilized'] === '1').length / teamData.length * 100).toFixed(1);

  const totalScore = teamData.reduce((sum, row) => sum + (parseFloat(row['Total Score']) || 0), 0);
  const totalCoral = teamData.reduce((sum, row) => {
    return sum +
      (parseInt(row['Auton L1']) || 0) +
      (parseInt(row['Auton L2']) || 0) +
      (parseInt(row['Auton L3']) || 0) +
      (parseInt(row['Auton L4']) || 0) +
      (parseInt(row['L1']) || 0) +
      (parseInt(row['L2']) || 0) +
      (parseInt(row['L3']) || 0) +
      (parseInt(row['L4']) || 0);
  }, 0);

  const totalAlgae = teamData.reduce((sum, row) => {
    return sum +
      (parseInt(row['Auton Algae in Net'] || 0)) * 2 +
      (parseInt(row['Auton Algae in Processor'] || 0)) * 3 +
      (parseInt(row['Algae in Net'] || 0) * 2) +
      (parseInt(row['Algae in Processor'] || 0) * 3);
  }, 0);

  return {
    epa: (totalScore / teamData.length).toFixed(1),
    avgCoral: (totalCoral / teamData.length).toFixed(1),
    avgAlgae: (totalAlgae / teamData.length).toFixed(1),
    climbSuccessRate,
    robotDiedRate
  };
}