// === Perpendicular Analyzer for Cyclone 3DR with SMeasure ===
// Advanced perpendicular distance measurement tool with SMeasure objects and SReport

var currentScriptPath = CurrentScriptPath();
print("Current script path: " + currentScriptPath);

var dialog = SDialog.New("Perpendicular Distance Analyzer");
dialog.SetHeader("SMeasure-Based Sphere to Line Analysis", "", 35);

dialog.AddText("This tool measures perpendicular distances\nfrom sphere centers to lines using SMeasure\nobjects with tolerance analysis and reporting.", SDialog.Instruction);
dialog.AddText("⚠️ Make sure you have spheres and lines\nin your document before starting.", SDialog.Warning);

// Analysis mode selection
dialog.AddChoices({
    id: "analysisMode",
    name: "Analysis Mode",
    tooltip: "Choose whether to perform tolerance analysis or just measure distances",
    choices: ["📏 Simple Measurement", "📊 Full Analysis"],
    value: 1,
    style: SDialog.SwitchButtons
});

dialog.SetButtons(["Continue", "Cancel"]);

var result = dialog.Run();
if (result.ErrorCode !== 0) {
    Print("❌ Operation cancelled by user.");
} else {
    Print("🚀 Starting Perpendicular Distance Analyzer with SMeasure...");
    ExecutePerpendicularAnalysis(result);
}

// === Main execution function ===
function ExecutePerpendicularAnalysis(mainResult) {
    // Get all spheres and lines
    var sphereData = GetAvailableSpheresAndLines();
    
    if (sphereData.spheres.length === 0) {
        Print("❌ No spheres found in document! Please add spheres to analyze.");
        return;
    }
    
    if (sphereData.lines.length === 0) {
        Print("❌ No lines found in document! Please add lines to analyze.");
        return;
    }
    
    Print("📐 Found " + sphereData.spheres.length + " spheres and " + sphereData.lines.length + " lines");
    
    // Show selection dialog with scenarios
    var selectedPairs = ShowSphereLineSelectionWithScenarios(sphereData);
    if (selectedPairs === null) {
        Print("❌ No sphere-line pairs selected.");
        return;
    }
    
    var toleranceData = null;
    
    // If full analysis mode, get tolerance and nominal data
    if (mainResult.analysisMode === 1) {
        toleranceData = GetToleranceAndNominalData(selectedPairs);
        if (toleranceData === null) {
            Print("❌ Tolerance analysis cancelled.");
            return;
        }
    }
    
    // Perform measurements (always create visuals)
    var measurements = PerformMeasurements(selectedPairs, sphereData, true);
    
    // Create SMeasure objects for BOTH modes
    var smeasureObjects = [];
    if (mainResult.analysisMode === 1 && toleranceData) {
        // Full analysis mode with tolerances
        smeasureObjects = CreateSMeasureObjects(measurements, toleranceData);
    } else {
        // Simple measurement mode - just distances
        smeasureObjects = CreateSimpleSMeasureObjects(measurements);
    }
    
    // Analyze results if in tolerance mode
    if (mainResult.analysisMode === 1 && toleranceData) {
        AnalyzeWithTolerances(measurements, toleranceData);
        
        // Update visual colors based on tolerance analysis
        UpdateVisualColors(measurements);
    }
    
    // Always create SReport
    CreateSReport(measurements, smeasureObjects, toleranceData, mainResult.analysisMode === 1);
    
    // Display summary
    DisplaySummary(measurements, mainResult.analysisMode === 1);
    
    if (measurements.length > 0) {
        ZoomAll();
    }
}

// === Get available spheres and lines ===
function GetAvailableSpheresAndLines() {
    var allSpheres = SSphere.All();
    var allLines = SMultiline.All();
    
    var sphereData = [];
    var lineData = [];
    
    // Process spheres
    for (var i = 0; i < allSpheres.length; i++) {
        var sphere = allSpheres[i];
        sphereData.push({
            object: sphere,
            name: sphere.GetName(),
            center: sphere.GetCenter(),
            index: i
        });
    }
    
    // Process lines (filter to measurement lines starting with "L")
    for (var i = 0; i < allLines.length; i++) {
        var line = allLines[i];
        var name = line.GetName();
        if (name.startsWith("L")) {
            lineData.push({
                object: line,
                name: name,
                index: i
            });
        }
    }
    
    return {
        spheres: sphereData,
        lines: lineData
    };
}

// === Show sphere-line selection with scenarios ===
function ShowSphereLineSelectionWithScenarios(sphereData) {
    // Preset combinations similar to length and angle measurements
    var presetCombinations = [
        {
            name: "🎯 Default Set",
            pairs: [],
            description: "Predefined sphere-line combinations for standard analysis"
        },
        {
            name: "📐 All Spheres to First Line",
            pairs: [],
            description: "Measure all spheres to the first available line"
        },
        {
            name: "🔧 Custom Selection",
            pairs: [],
            description: "Choose individual sphere-line pairs manually"
        }
    ];
    
    // Generate default set - first 3 spheres to first 2 lines (if available)
    for (var i = 0; i < Math.min(3, sphereData.spheres.length); i++) {
        for (var j = 0; j < Math.min(2, sphereData.lines.length); j++) {
            presetCombinations[0].pairs.push({
                sphereIndex: i,
                lineIndex: j,
                sphereName: sphereData.spheres[i].name,
                lineName: sphereData.lines[j].name
            });
        }
    }
    
    // Generate all spheres to first line
    if (sphereData.lines.length > 0) {
        for (var i = 0; i < sphereData.spheres.length; i++) {
            presetCombinations[1].pairs.push({
                sphereIndex: i,
                lineIndex: 0,
                sphereName: sphereData.spheres[i].name,
                lineName: sphereData.lines[0].name
            });
        }
    }
    
    // Quick selection dialog
    var quickDialog = SDialog.New("📐 Sphere-Line Pair Selection for SMeasure");
    quickDialog.AddText("📐 Found " + sphereData.spheres.length + " spheres and " + sphereData.lines.length + " measurement lines", SDialog.Success);
    quickDialog.AddText("📋 Choose how you want to measure perpendicular distances:", SDialog.Instruction);
    quickDialog.AddText("💡 Each pair will create SMeasure objects with perpendicular distance analysis", SDialog.Info);
    
    var presetChoices = presetCombinations.map(function(combo) {
        return combo.name + " - " + combo.description;
    });
    
    quickDialog.AddChoices({
        id: "presetChoice",
        name: "📋 Measurement Patterns",
        choices: presetChoices,
        value: 0,
        tooltip: "Select a predefined set of sphere-line pairs for quick setup",
        style: SDialog.ComboBox
    });

    quickDialog.SetButtons(["➡️ Continue", "❌ Cancel"]);
    var quickResult = quickDialog.Run();
    if (quickResult.ErrorCode !== 0) {
        Print("Operation cancelled by user.");
        return null;
    }

    var selectedPairs;
    var selectedPreset = presetCombinations[quickResult.presetChoice];
    
    if (selectedPreset.name === "🔧 Custom Selection") {
        // Show detailed selection dialog
        selectedPairs = ShowDetailedSphereLineSelectionDialog(sphereData);
        if (selectedPairs === null) {
            Print("Operation cancelled by user.");
            return null;
        }
    } else {
        selectedPairs = selectedPreset.pairs;
        Print("📐 Using preset: " + selectedPreset.name + " with " + selectedPairs.length + " measurement pairs");
    }

    return selectedPairs;
}

function ShowDetailedSphereLineSelectionDialog(sphereData) {
    var selectionDialog = SDialog.New("🔧 Custom Sphere-Line Pair Selection");
    selectionDialog.AddText("🎯 Select exactly which sphere-line combinations\nyou want to analyze:", SDialog.Instruction);
    selectionDialog.AddText("💡 Tip: Choose pairs that are important for your perpendicular distance analysis", SDialog.Info);
    
    var pairCounter = 0;
    var pairMappings = [];
    
    // Show ALL spheres and ALL measurement lines
    for (var i = 0; i < sphereData.spheres.length; i++) {
        var sphere = sphereData.spheres[i];
        selectionDialog.BeginGroup("📐 From " + sphere.name);
        
        for (var j = 0; j < sphereData.lines.length; j++) {
            var line = sphereData.lines[j];
            
            pairMappings[pairCounter] = {
                sphereIndex: i,
                lineIndex: j,
                sphereName: sphere.name,
                lineName: line.name
            };
            
            selectionDialog.AddBoolean({
                id: "pair" + pairCounter,
                name: "📐 → " + line.name,
                tooltip: "Measure perpendicular from " + sphere.name + " to " + line.name,
                value: (i === 0 && j < 2) // Default select first sphere to first 2 lines
            });
            
            pairCounter++;
        }
    }

    selectionDialog.AddText("⚠️ Remember: You'll set nominal distances for each selected pair in the next step", SDialog.Warning);
    selectionDialog.SetButtons(["✅ Confirm Selection", "❌ Cancel"]);
    var selectionResult = selectionDialog.Run();
    
    if (selectionResult.ErrorCode !== 0) {
        return null;
    }

    // Get selected pairs
    var selectedPairs = [];
    for (var i = 0; i < pairCounter; i++) {
        if (selectionResult["pair" + i]) {
            selectedPairs.push(pairMappings[i]);
        }
    }

    return selectedPairs;
}

// === Get tolerance and nominal data ===
function GetToleranceAndNominalData(selectedPairs) {
    var toleranceDialog = SDialog.New("📐 Set Nominal Distances for SMeasure");
    toleranceDialog.AddText("🎯 Define the expected (nominal) perpendicular distances\nfor SMeasure tolerance analysis", SDialog.Instruction);
    toleranceDialog.AddText("📊 SMeasure will automatically calculate:\nActual Distance, Deviation, and Status", SDialog.Info);
    toleranceDialog.AddText("💡 Distances are measured in current document units", SDialog.Success);
    
    // Global tolerance settings
    toleranceDialog.BeginGroup("Global Tolerance Settings");
    
    toleranceDialog.AddFloat({
        id: "globalGoodTolerance",
        name: "Good tolerance (±)",
        tooltip: "Maximum deviation considered acceptable (Green status)",
        value: 0.1,
        min: 0.001,
        max: 100.0
    });
    
    toleranceDialog.AddFloat({
        id: "globalWarningTolerance",
        name: "Warning tolerance (±)",
        tooltip: "Maximum deviation before error status (Yellow status)",
        value: 0.5,
        min: 0.001,
        max: 100.0
    });
    
    // Individual nominal values
    toleranceDialog.BeginGroup("📐 Nominal Distance Values (in current units)");
    
    for (var i = 0; i < selectedPairs.length; i++) {
        var pair = selectedPairs[i];
        
        toleranceDialog.AddFloat({
            id: "nominal" + i,
            name: "📐 " + pair.sphereName + " → " + pair.lineName,
            tooltip: "Expected perpendicular distance for this pair",
            value: 10.0,
            min: 0.0,
            max: 1000.0
        });
    }
    
    toleranceDialog.SetButtons(["✅ Create SMeasure Objects", "❌ Cancel"]);
    var toleranceResult = toleranceDialog.Run();
    
    if (toleranceResult.ErrorCode !== 0) {
        return null;
    }
    
    // Build tolerance data object
    var toleranceData = {
        goodTolerance: toleranceResult.globalGoodTolerance,
        warningTolerance: toleranceResult.globalWarningTolerance,
        nominals: []
    };
    
    for (var i = 0; i < selectedPairs.length; i++) {
        toleranceData.nominals.push(toleranceResult["nominal" + i]);
    }
    
    return toleranceData;
}

// === Perform measurements ===
function PerformMeasurements(selectedPairs, sphereData, createVisuals) {
    Print("📐 Starting measurements...");
    
    var measurements = [];
    
    for (var i = 0; i < selectedPairs.length; i++) {
        var pair = selectedPairs[i];
        var sphere = sphereData.spheres[pair.sphereIndex];
        var line = sphereData.lines[pair.lineIndex];
        
        Print("📐 Measuring: " + sphere.name + " → " + line.name);
        
        // Calculate perpendicular
        var perpResult = CalculatePerpendicularToLine(sphere.center, line.object);
        
        if (perpResult === null) {
            Print("⚠️ Error calculating perpendicular for " + sphere.name + " → " + line.name);
            continue;
        }
        
        var measurement = {
            sphereName: sphere.name,
            lineName: line.name,
            distance: perpResult.distance,
            footPoint: perpResult.footPoint,
            sphereCenter: sphere.center,
            parameter: perpResult.parameter,
            pairIndex: i
        };
        
        measurements.push(measurement);
        
        // Create visuals if requested
        if (createVisuals) {
            CreateVisualsForMeasurement(measurement);
        }
        
        Print("  📊 Distance: " + perpResult.distance.toFixed(3) + " units");
    }
    
    Print("✅ Completed " + measurements.length + " measurements");
    return measurements;
}

// === Create visual elements ===
function CreateVisualsForMeasurement(measurement) {
    var perpName = "Perp_" + measurement.sphereName + "_to_" + measurement.lineName;
    
    // Create perpendicular line
    var perpLine = SMultiline.New();
    perpLine.InsertLast(measurement.sphereCenter);
    perpLine.InsertLast(measurement.footPoint);
    perpLine.SetName(perpName);
    
    // Set color based on tolerance status if available
    if (measurement.status) {
        if (measurement.status.indexOf("🟢") !== -1) {
            perpLine.SetColors(0, 1, 0); // Green - Good
        } else if (measurement.status.indexOf("🟡") !== -1) {
            perpLine.SetColors(1, 1, 0); // Yellow - Warning
        } else if (measurement.status.indexOf("🔴") !== -1) {
            perpLine.SetColors(1, 0, 0); // Red - Error
        } else {
            perpLine.SetColors(0, 0, 1); // Blue - Default
        }
    } else {
        perpLine.SetColors(0, 0, 1); // Blue - Simple mode
    }
    
    perpLine.SetLineWidth(3);
    perpLine.AddToDoc();
    
    // Create foot marker
    var footMarker = SPoint.New(measurement.footPoint);
    var footName = "Foot_" + measurement.sphereName + "_" + measurement.lineName;
    footMarker.SetName(footName);
    footMarker.SetPointSize(8);
    footMarker.SetColors(1, 0, 0); // Red
    footMarker.AddToDoc();
}

// === Create simple SMeasure objects (distance only) ===
function CreateSimpleSMeasureObjects(measurements) {
    Print("🔧 Creating simple SMeasure objects...");
    
    var smeasureObjects = [];
    var measureCounter = 1;
    
    for (var i = 0; i < measurements.length; i++) {
        var measurement = measurements[i];
        
        // Create SMeasure object
        var measureName = "Perp_" + measurement.sphereName + "_" + measurement.lineName;
        var attachPoint = FindMidPoint(measurement.sphereCenter, measurement.footPoint);
        
        var smeasure = SMeasure.New(measureName, attachPoint, measureCounter, "Distance: " + measurement.distance.toFixed(3));
        
        // Add simple distance row
        var rowDefinition = {
            "key": "distance",
            "name": "",
            "unit": "units",
            "values": [
                {
                    "key": "actual",
                    "value": measurement.distance
                }
            ]
        };
        
        var addResult = smeasure.AddRow(rowDefinition);
        if (addResult.ErrorCode === 0) {
            smeasure.AddToDoc();
            smeasureObjects.push(smeasure);
            
            Print("  ✅ Created SMeasure: " + measureName + " - " + measurement.distance.toFixed(3));
            measureCounter++;
        } else {
            Print("  ⚠️ Error creating SMeasure for " + measureName + " (ErrorCode: " + addResult.ErrorCode + ")");
        }
    }
    
    Print("✅ Created " + smeasureObjects.length + " simple SMeasure objects");
    return smeasureObjects;
}

// === Create SMeasure objects ===
function CreateSMeasureObjects(measurements, toleranceData) {
    Print("🔧 Creating SMeasure objects...");
    
    var smeasureObjects = [];
    var measureCounter = 1;
    
    for (var i = 0; i < measurements.length; i++) {
        var measurement = measurements[i];
        var nominal = toleranceData.nominals[i];
        var deviation = measurement.distance - nominal;
        var absDeviation = Math.abs(deviation);
        
        // Determine status
        var statusComment = "";
        if (absDeviation <= toleranceData.goodTolerance) {
            statusComment = "🟢 Good";
        } else if (absDeviation <= toleranceData.warningTolerance) {
            statusComment = "🟡 Warning";
        } else {
            statusComment = "🔴 Error";
        }
        
        // Create SMeasure object
        var measureName = "Perp_" + measurement.sphereName + "_" + measurement.lineName;
        var attachPoint = FindMidPoint(measurement.sphereCenter, measurement.footPoint);
        
        var smeasure = SMeasure.New(measureName, attachPoint, measureCounter, statusComment);
        
        // Set tolerances
        var tolMin = -toleranceData.warningTolerance;
        var tolMax = toleranceData.warningTolerance;
        
        // Add measurement data row
        var rowDefinition = {
            "key": "distance",
            "name": "",
            "unit": "units",
            "tolMin": tolMin,
            "tolMax": tolMax,
            "values": [
                {
                    "key": "actual",
                    "value": measurement.distance
                },
                {
                    "key": "nominal",
                    "value": nominal
                },
                {
                    "key": "deviation",
                    "value": deviation
                }
            ]
        };
        
        var addResult = smeasure.AddRow(rowDefinition);
        if (addResult.ErrorCode === 0) {
            smeasure.AddToDoc();
            smeasureObjects.push(smeasure);
            
            Print("  ✅ Created SMeasure: " + measureName + " - " + statusComment);
            measureCounter++;
        } else {
            Print("  ⚠️ Error creating SMeasure for " + measureName + " (ErrorCode: " + addResult.ErrorCode + ")");
        }
        
        // Store analysis data in measurement
        measurement.nominal = nominal;
        measurement.deviation = deviation;
        measurement.absDeviation = absDeviation;
        measurement.status = statusComment;
    }
    
    Print("✅ Created " + smeasureObjects.length + " SMeasure objects");
    return smeasureObjects;
}

// === Update visual colors based on tolerance analysis ===
function UpdateVisualColors(measurements) {
    Print("🎨 Updating visual colors based on tolerance status...");
    
    for (var i = 0; i < measurements.length; i++) {
        var measurement = measurements[i];
        var perpName = "Perp_" + measurement.sphereName + "_to_" + measurement.lineName;
        
        // Find the perpendicular line
        var lines = SMultiline.FromName(perpName);
        if (lines.length > 0) {
            var perpLine = lines[0];
            
            // Set color based on status
            if (measurement.status) {
                if (measurement.status.indexOf("🟢") !== -1) {
                    perpLine.SetColors(0, 1, 0); // Green - Good
                } else if (measurement.status.indexOf("🟡") !== -1) {
                    perpLine.SetColors(1, 1, 0); // Yellow - Warning
                } else if (measurement.status.indexOf("🔴") !== -1) {
                    perpLine.SetColors(1, 0, 0); // Red - Error
                }
            }
        }
    }
}

// === Analyze with tolerances ===
function AnalyzeWithTolerances(measurements, toleranceData) {
    Print("📊 Analyzing measurements with tolerances...");
    
    for (var i = 0; i < measurements.length; i++) {
        var measurement = measurements[i];
        if (measurement.nominal !== undefined) {
            Print("  " + measurement.sphereName + " → " + measurement.lineName + ": " + 
                  measurement.distance.toFixed(3) + " (nom: " + measurement.nominal.toFixed(3) + 
                  ", dev: " + measurement.deviation.toFixed(3) + ") - " + measurement.status);
        }
    }
}

// === Create SReport ===
function CreateSReport(measurements, smeasureObjects, toleranceData, isToleranceMode) {
    try {
        Print("📋 Creating SReport...");
        
        // Create SReportData
        var reportData = SReportData.New("Perpendicular Analysis Report");
        
        // Add report metadata
        reportData.AddText("Title", "Perp Analysis");
        reportData.AddText("Date", new Date().toDateString());
        reportData.AddText("Mode", isToleranceMode ? "Full Analysis" : "Simple Measurement");
        reportData.AddNumber("Total", measurements.length);
        
        if (isToleranceMode && toleranceData) {
            reportData.AddNumber("GoodTol", toleranceData.goodTolerance);
            reportData.AddNumber("WarnTol", toleranceData.warningTolerance);
            
            // Calculate statistics
            var goodCount = 0, warningCount = 0, errorCount = 0;
            for (var i = 0; i < measurements.length; i++) {
                var measurement = measurements[i];
                if (measurement.status && measurement.status.indexOf("🟢") !== -1) goodCount++;
                else if (measurement.status && measurement.status.indexOf("🟡") !== -1) warningCount++;
                else if (measurement.status && measurement.status.indexOf("🔴") !== -1) errorCount++;
            }
            
            reportData.AddNumber("GoodCount", goodCount);
            reportData.AddNumber("WarningCount", warningCount);
            reportData.AddNumber("ErrorCount", errorCount);
        }
        
        // Add SMeasure objects to report
        if (smeasureObjects.length > 0) {
            var addMeasuresResult = reportData.AddMeasures("PerpMeasures", smeasureObjects);
            if (addMeasuresResult.ErrorCode === 0) {
                Print("✅ Added " + smeasureObjects.length + " SMeasure objects to report");
            } else {
                Print("⚠️ Error adding SMeasures to report (ErrorCode: " + addMeasuresResult.ErrorCode + ")");
            }
        }
        
        // Add report to document
        reportData.SetName("Perp Analysis");
        reportData.AddToDoc();
        
        Print("✅ SReport created successfully");
        
    } catch (error) {
        Print("⚠️ Error creating SReport: " + error.message);
        // Fallback - print measurements to console
        PrintMeasurementsToConsole(measurements);
    }
}

// === Helper function for perpendicular calculation ===
function CalculatePerpendicularToLine(point, line) {
    try {
        // Get line endpoints
        var p1 = line.GetPoint(0);
        var p2 = line.GetPoint(1);
        
        // Get point coordinates
        var px = point.GetX();
        var py = point.GetY();
        var pz = point.GetZ();
        
        // Get line vector
        var lineVec = {
            x: p2.GetX() - p1.GetX(),
            y: p2.GetY() - p1.GetY(),
            z: p2.GetZ() - p1.GetZ()
        };
        
        // Vector from line start to point
        var pointVec = {
            x: px - p1.GetX(),
            y: py - p1.GetY(),
            z: pz - p1.GetZ()
        };
        
        // Calculate parameter t for foot of perpendicular
        var lineLengthSq = lineVec.x * lineVec.x + lineVec.y * lineVec.y + lineVec.z * lineVec.z;
        if (lineLengthSq === 0) {
            return null; // Line has zero length
        }
        
        var t = (pointVec.x * lineVec.x + pointVec.y * lineVec.y + pointVec.z * lineVec.z) / lineLengthSq;
        
        // Calculate foot of perpendicular
        var footX = p1.GetX() + t * lineVec.x;
        var footY = p1.GetY() + t * lineVec.y;
        var footZ = p1.GetZ() + t * lineVec.z;
        
        var footPoint = SPoint.New(footX, footY, footZ);
        
        // Calculate distance
        var distance = Math.sqrt(
            (px - footX) * (px - footX) +
            (py - footY) * (py - footY) +
            (pz - footZ) * (pz - footZ)
        );
        
        return {
            footPoint: footPoint,
            distance: distance,
            parameter: t
        };
        
    } catch (error) {
        Print("⚠️ Error in perpendicular calculation: " + error.message);
        return null;
    }
}

// === Display summary ===
function DisplaySummary(measurements, isToleranceMode) {
    Print("");
    Print("🎉 Perpendicular Analysis Complete!");
    Print("📊 Summary:");
    Print("  📐 Total measurements: " + measurements.length);
    
    if (isToleranceMode) {
        var goodCount = 0, warningCount = 0, errorCount = 0;
        for (var i = 0; i < measurements.length; i++) {
            var measurement = measurements[i];
            if (measurement.status && measurement.status.indexOf("🟢") !== -1) goodCount++;
            else if (measurement.status && measurement.status.indexOf("🟡") !== -1) warningCount++;
            else if (measurement.status && measurement.status.indexOf("🔴") !== -1) errorCount++;
        }
        
        Print("  🟢 Good: " + goodCount);
        Print("  🟡 Warning: " + warningCount);
        Print("  🔴 Error: " + errorCount);
        
        if (errorCount > 0) {
            Print("⚠️ " + errorCount + " measurements are outside acceptable tolerances!");
        } else if (warningCount > 0) {
            Print("💡 " + warningCount + " measurements are in warning range");
        } else {
            Print("✅ All measurements are within acceptable tolerances!");
        }
    }
    
    Print("💡 Check SMeasure objects in the document for detailed analysis");
    Print("💡 View generated reports in the document tree");
}

// === Helper functions ===
function GetTimeStamp() {
    var now = new Date();
    return now.getFullYear() + "-" + 
           PadZero(now.getMonth() + 1) + "-" + 
           PadZero(now.getDate()) + "_" + 
           PadZero(now.getHours()) + "-" + 
           PadZero(now.getMinutes()) + "-" + 
           PadZero(now.getSeconds());
}

function PadZero(num) {
    return (num < 10 ? "0" : "") + num;
}

function FindMidPoint(p1, p2) {
    return SPoint.New(
        (p1.GetX() + p2.GetX()) / 2,
        (p1.GetY() + p2.GetY()) / 2,
        (p1.GetZ() + p2.GetZ()) / 2
    );
}

function PrintMeasurementsToConsole(measurements) {
    Print("📊 MEASUREMENTS FALLBACK OUTPUT:");
    Print("=" + RepeatChar("=", 50));
    for (var i = 0; i < measurements.length; i++) {
        var m = measurements[i];
        var line = m.sphereName + " -> " + m.lineName + ": " + m.distance.toFixed(3);
        if (m.nominal !== undefined) {
            line += " (nominal: " + m.nominal.toFixed(3) + 
                   ", deviation: " + m.deviation.toFixed(3) + 
                   ", status: " + (m.status || "N/A") + ")";
        }
        Print("  " + line);
    }
    Print("=" + RepeatChar("=", 50));
}

function RepeatChar(char, count) {
    var result = "";
    for (var i = 0; i < count; i++) {
        result += char;
    }
    return result;
}

Print("✅ Perpendicular Analyzer with SMeasure loaded successfully!");
Print("💡 The script will create SMeasure objects and SReport for professional measurement analysis");